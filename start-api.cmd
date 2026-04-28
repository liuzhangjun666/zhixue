@echo off
cd /d D:\zhixue
echo [%date% %time%] starting api>> .api-dev.log
npm.cmd run api:dev >> .api-dev.log 2>&1
