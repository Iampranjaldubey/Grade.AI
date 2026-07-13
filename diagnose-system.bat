@echo off
REM Diagnostic script for Grade.AI document processing issues
REM Run this to check system status

echo ============================================
echo Grade.AI System Diagnostics
echo ============================================
echo.

echo [1/8] Checking Docker containers status...
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo.

echo [2/8] Checking Celery worker logs (last 20 lines)...
docker logs gradeai-celery --tail=20
echo.

echo [3/8] Checking Redis connection...
docker exec -it gradeai-redis redis-cli PING
echo.

echo [4/8] Checking Celery queue length...
docker exec -it gradeai-redis redis-cli LLEN celery
echo.

echo [5/8] Checking PostgreSQL connection...
docker exec -it gradeai-postgres pg_isready -U gradeai
echo.

echo [6/8] Checking ChromaDB health...
curl -s http://localhost:8001/api/v1/heartbeat
echo.

echo [7/8] Checking MinIO (should return XML or Access Denied)...
curl -s http://localhost:9000/
echo.

echo [8/8] Checking backend API health...
curl -s http://localhost:8000/api/v1/health
echo.

echo.
echo ============================================
echo Diagnostics Complete
echo ============================================
echo.
echo Next Steps:
echo 1. All containers should show "Up" status
echo 2. Redis should respond "PONG"
echo 3. PostgreSQL should respond "accepting connections"
echo 4. ChromaDB should return JSON heartbeat
echo 5. Check DOCUMENT_PROCESSING_DIAGNOSIS.md for detailed troubleshooting
echo.

pause
