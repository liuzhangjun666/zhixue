@echo off
cd /d D:\zhixue
echo [%date% %time%] starting web>> .web-dev.log
npm.cmd run dev >> .web-dev.log 2>&1
