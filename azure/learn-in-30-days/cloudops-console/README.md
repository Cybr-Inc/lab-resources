# CloudOps console resources

The console is a small static site: one page, one stylesheet, one script. It is the application the learner carries through week two of Learn Azure in 30 Days.

- Day 8 installs it on a Linux virtual machine with nginx.
- Day 10 moves it to Azure App Service.
- Day 12 connects it to the Foundry agent endpoint.

The console home page reads `flag.txt` from the site root and shows the contents as the launch code. `flag.txt` is not part of the ZIP on purpose: the Day 8 flag must not be published in this repository. The learner creates `flag.txt` on the VM from a value they read in the Azure portal.

The public files are not an access-control boundary. A learner can browse ahead in GitHub.

The approved console is packaged as `cloudops-console.zip`. Its three files sit at the ZIP root so learners can extract them straight into the nginx site root.
