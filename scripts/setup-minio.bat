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

REM Create bucket. Must match AWS_S3_BUCKET in backend\.env.
if "%AWS_S3_BUCKET%"=="" set AWS_S3_BUCKET=gradeai-uploads
echo Creating bucket '%AWS_S3_BUCKET%'...
mc mb myminio/%AWS_S3_BUCKET% --ignore-existing

REM Keep objects private: the app only serves presigned URLs.
mc anonymous set none myminio/%AWS_S3_BUCKET%

REM Verify
echo.
echo Verifying setup...
mc ls myminio/

echo.
echo ========================================
echo   Setup Complete!
echo ========================================
echo.
pause
