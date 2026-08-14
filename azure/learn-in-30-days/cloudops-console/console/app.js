fetch("flag.txt", { cache: "no-store" })
  .then(function (response) {
    if (!response.ok) {
      throw new Error("flag.txt is missing");
    }
    return response.text();
  })
  .then(function (text) {
    var code = text.trim();
    if (!code) {
      return;
    }
    var el = document.getElementById("launch-code");
    el.textContent = code;
    el.classList.remove("code-pending");
    el.classList.add("code-ok");
  })
  .catch(function () {});
