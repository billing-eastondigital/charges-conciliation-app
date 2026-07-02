@echo off
cd /d "C:\Users\marco\Documents\recon-app-template"
set GIT_SSH_COMMAND=ssh -i C:/Users/marco/.ssh/id_billing_eastondigital

echo === Fix HEAD and main ref ===
echo ref: refs/heads/main> .git\HEAD
echo 678ee37d6f9c906862d7e7d09831fb0502533b76> .git\refs\heads\main

echo === git status ===
git status

echo === git log ===
git log --oneline -3

echo === Stage new files ===
git add -A
git status

echo === Commit ===
git commit -m "feat: native Stripe invoice creation edge function (replaces Make.com)"

echo === Push ===
git push origin main

echo.
echo Done. Press any key to close.
pause
