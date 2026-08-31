@echo off
REM MinIO Setup Script for GradeAI (Windows)

echo.
echo ========================================
echo   MinIO Setup for GradeAI
echo ========================================
echo.

REM Check if mc is installed
where mc >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] MinIO Client (mc) is not installed
    echo.
    echo Install it with: choco install minio-client
    echo Or download from: https://min.io/docs/minio/windows/reference/minio-mc.html
    echo.
    pause
    exit /b 1
)

echo [OK] MinIO Client found
echo.

REM Configure MinIO alias
echo Configuring MinIO alias...
mc alias set myminio http://localhost:9000 minioadmin minioadmin

REM Check connection
mc admin info myminio >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Cannot connect to MinIO at http://localhost:9000
    echo Make sure MinIO is running: docker-compose up -d minio
    echo.
    pause
    exit /b 1
)

echo [OK] Connected to MinIO
echo.

REM Create bucket
echo Creating bucket 'gradeai-files'...
mc mb myminio/gradeai-files --ignore-existing

REM Set bucket policy
echo Setting bucket policy...
mc anonymous set download myminio/gradeai-files

REM Verify
echo.
echo Verifying setup...
mc ls myminio/

echo.
echo ========================================
echo   Setup Complete!
echo ========================================
echo.
echo IMPORTANT: Configure CORS manually
echo.
echo 1. Open MinIO Console: http://localhost:9001
echo 2. Login: minioadmin / minioadmin
echo 3. Go to: Buckets -^> gradeai-files -^> Settings
echo 4. Find "Access Rules" or "CORS Configuration"
echo 5. Add the CORS rules from minio-cors.json file
echo.
echo Then test your upload!
echo.
pause
