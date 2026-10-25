"""
Seed a realistic demo: one professor, four students, an Operating Systems course,
two assignments with rubrics, indexed course material, and four AI-graded
submissions in different review states.

Everything goes through the public API (plus a direct object upload to storage),
so the data is exactly what real usage produces: documents are parsed and
embedded by Celery and submissions are graded by Gemini. Requires the full stack
to be running and GEMINI_API_KEY to be set.

Run inside the backend container:
    docker compose exec backend python scripts/seed_demo.py
"""

import sys
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import get_settings  # noqa: E402
from app.services.s3_service import S3Service  # noqa: E402

API = "http://localhost:8000/api/v1"
PASSWORD = "demo-pass-123"
PROFESSOR = ("prof.demo@example.com", "Ananya Rao")
STUDENTS = {
    "excellent": ("aarav.demo@example.com", "Aarav Mehta"),
    "good": ("diya.demo@example.com", "Diya Sharma"),
    "partial": ("kabir.demo@example.com", "Kabir Singh"),
    "weak": ("meera.demo@example.com", "Meera Iyer"),
}
GRADING_TIMEOUT_SECONDS = 300

LECTURE_NOTES = """CS301 Lecture 6: CPU Scheduling

Scheduling criteria: CPU utilisation, throughput, turnaround time, waiting time and
response time. Interactive systems care most about response time.

First-Come First-Served (FCFS) runs processes in arrival order. It is simple but a
long CPU-bound job delays every short job behind it (the convoy effect).

Shortest Job First (SJF) minimises average waiting time but needs the next CPU burst
length in advance, which is usually estimated with exponential averaging. Long jobs
can starve.

Round Robin (RR) gives each ready process a fixed time quantum. When the quantum
expires the process is preempted and placed at the tail of the ready queue. RR is
designed for time-sharing: no process waits more than (n - 1) * q time units.

Choosing the quantum: if q is very large, RR degenerates into FCFS. If q is very
small, the CPU spends a large fraction of time on context switches, so overhead
dominates. A rule of thumb is that about 80% of CPU bursts should be shorter than q,
and q should be large relative to the context-switch time (typically 10-100 ms
against a switch of under 10 microseconds).
"""

SAMPLE_SOLUTION = """Model answer: Round Robin scheduling

Round Robin keeps the ready queue as a FIFO queue and gives each process at most one
time quantum q of CPU before preempting it and moving it to the tail. Because every
process gets a turn within (n - 1) * q, RR gives good response time and no process
starves.

The quantum is a trade-off. A large quantum reduces context-switch overhead but
increases response time, and in the limit RR behaves like FCFS. A small quantum
improves responsiveness but wastes CPU time on context switches.

Compared with FCFS, RR avoids the convoy effect. Compared with SJF, RR does not need
burst-length predictions and cannot starve long jobs, but its average waiting time is
usually higher than SJF.
"""

ANSWERS = {
    "excellent": """Round Robin scheduling is a preemptive algorithm built for time-sharing
systems. The ready queue is a circular FIFO queue and each process runs for at most one
time quantum. When the quantum expires the timer interrupts, the process is preempted
and moved to the tail of the queue, so every process gets the CPU within (n-1)*q time
and nothing starves.

The size of the quantum is the key design decision. If q is very large, processes
finish their bursts before being preempted and RR turns into FCFS, with poor response
time. If q is very small, the CPU performs a context switch every few microseconds and
the switching overhead dominates useful work. A good quantum is large compared to the
context-switch time, and about 80% of CPU bursts should finish within one quantum.

Compared with FCFS, RR avoids the convoy effect where short jobs wait behind one long
CPU-bound job. Compared with SJF, RR needs no prediction of burst lengths and cannot
starve long jobs, although SJF achieves a lower average waiting time.""",
    "good": """Round robin gives every process a small unit of CPU time called a time
quantum. After the quantum the process is interrupted and put at the back of the ready
queue, and the next process runs. This is fair because every process gets a turn.

If the quantum is too big, round robin behaves like first come first served. If the
quantum is too small there are too many context switches, which wastes CPU time.

Round robin is better than FCFS for interactive users because short jobs do not have
to wait for long jobs to finish.""",
    "partial": """In round robin each process gets the CPU for a fixed time and then the
next process gets it. The processes keep taking turns until they are all finished. It
is used in operating systems like Windows and Linux to make multitasking possible.

Round robin is fair to all processes. I think a bigger time slice is always better
because the processes finish faster.""",
    "weak": """CPU scheduling decides which program runs on the processor. There are many
algorithms such as FCFS, SJF, priority and round robin. Scheduling is important because
it makes the computer faster and lets many programs run. Modern computers have many
cores so scheduling is less important now.""",
}

ROUND_ROBIN_RUBRIC = [
    {
        "criteria_name": "Mechanism",
        "max_points": "8",
        "weight": "40",
        "description": "Correctly explains how Round Robin works: time quantum, "
        "preemption, and the FIFO ready queue.",
        "evaluation_hints": "Full marks need preemption at quantum expiry and "
        "re-queueing at the tail.",
    },
    {
        "criteria_name": "Quantum trade-off",
        "max_points": "6",
        "weight": "30",
        "description": "Explains the effect of a large versus small time quantum.",
        "evaluation_hints": "Large quantum degenerates to FCFS; small quantum causes "
        "context-switch overhead.",
    },
    {
        "criteria_name": "Comparison",
        "max_points": "6",
        "weight": "30",
        "description": "Compares Round Robin with at least one other algorithm "
        "(FCFS or SJF) with a correct justification.",
        "evaluation_hints": None,
    },
]

DEADLOCK_RUBRIC = [
    {
        "criteria_name": "Coffman conditions",
        "max_points": "6",
        "weight": "60",
        "description": "States all four necessary conditions for deadlock.",
        "evaluation_hints": None,
    },
    {
        "criteria_name": "Prevention strategy",
        "max_points": "4",
        "weight": "40",
        "description": "Describes how breaking one condition prevents deadlock.",
        "evaluation_hints": None,
    },
]


class SeedError(RuntimeError):
    pass


client = httpx.Client(base_url=API, timeout=30)
storage = S3Service(get_settings())


def expect(response: httpx.Response, status: int = 200) -> dict:
    if response.status_code != status:
        raise SeedError(
            f"{response.request.method} {response.request.url.path} -> "
            f"{response.status_code}: {response.text[:300]}"
        )
    return response.json()


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def register(email: str, name: str, role: str) -> str:
    data = expect(
        client.post(
            "/auth/register",
            json={"email": email, "password": PASSWORD, "name": name, "role": role},
        ),
        201,
    )
    return data["access_token"]


def upload_text(
    token: str,
    *,
    file_name: str,
    text: str,
    doc_type: str,
    course_id: str,
    assignment_id: str | None,
) -> str:
    """Presign, store the object, and return its key."""
    body = text.encode()
    presign = expect(
        client.post(
            "/uploads/presign",
            headers=auth(token),
            json={
                "file_name": file_name,
                "content_type": "text/plain",
                "doc_type": doc_type,
                "course_id": course_id,
                "assignment_id": assignment_id,
                "file_size_bytes": len(body),
            },
        )
    )
    # The presigned URL is signed for the browser-facing host, which is not
    # reachable from inside the container, so store the object directly.
    storage._client.put_object(
        Bucket=storage.bucket, Key=presign["file_key"], Body=body, ContentType="text/plain"
    )
    return presign["file_key"]


def add_course_document(
    token: str, course_id: str, assignment_id: str, *, file_name: str, text: str, doc_type: str
) -> str:
    key = upload_text(
        token,
        file_name=file_name,
        text=text,
        doc_type=doc_type,
        course_id=course_id,
        assignment_id=assignment_id,
    )
    doc = expect(
        client.post(
            "/uploads/confirm",
            headers=auth(token),
            json={
                "file_key": key,
                "file_name": file_name,
                "file_size_bytes": len(text.encode()),
                "doc_type": doc_type,
                "course_id": course_id,
                "assignment_id": assignment_id,
            },
        ),
        201,
    )
    return doc["id"]


def wait_for_documents(token: str, document_ids: list[str]) -> None:
    deadline = time.time() + GRADING_TIMEOUT_SECONDS
    pending = set(document_ids)
    while pending and time.time() < deadline:
        for doc_id in list(pending):
            status = expect(client.get(f"/uploads/{doc_id}/status", headers=auth(token)))
            if status["parse_status"] == "success":
                pending.discard(doc_id)
            elif status["parse_status"] == "failed":
                raise SeedError(f"Document {doc_id} failed to process")
        time.sleep(2)
    if pending:
        raise SeedError("Timed out waiting for course material to be indexed")


def wait_for_evaluation(token: str, submission_id: str) -> dict:
    deadline = time.time() + GRADING_TIMEOUT_SECONDS
    while time.time() < deadline:
        response = client.get(f"/evaluations/by-submission/{submission_id}", headers=auth(token))
        if response.status_code == 200:
            return response.json()
        time.sleep(3)
    raise SeedError(f"Timed out waiting for submission {submission_id} to be graded")


def main() -> None:
    settings = get_settings()
    if not settings.gemini_api_key:
        raise SeedError("GEMINI_API_KEY is not set; demo grades would all be placeholders.")

    existing = client.post("/auth/login", json={"email": PROFESSOR[0], "password": PASSWORD})
    if existing.status_code == 200:
        print("Demo data already exists. Log in with the accounts below.")
        print_accounts()
        return

    print("Creating accounts...")
    prof = register(*PROFESSOR, "professor")
    students = {key: register(email, name, "student") for key, (email, name) in STUDENTS.items()}

    print("Creating course and assignments...")
    course = expect(
        client.post(
            "/courses",
            headers=auth(prof),
            json={
                "course_name": "Operating Systems",
                "course_code": "CS301",
                "semester": "Fall 2026",
                "description": "Processes, scheduling, synchronisation, memory and file systems.",
            },
        ),
        201,
    )
    now = datetime.now(UTC)
    rr = expect(
        client.post(
            "/assignments",
            headers=auth(prof),
            json={
                "course_id": course["id"],
                "title": "Round Robin Scheduling",
                "description": "Explain how Round Robin scheduling works, discuss how the "
                "time quantum affects its behaviour, and compare it with another "
                "scheduling algorithm.",
                "due_date": (now + timedelta(days=5)).isoformat(),
                "max_score": "20",
                "grading_mode": "hybrid",
            },
        ),
        201,
    )
    expect(
        client.post(
            f"/assignments/{rr['id']}/rubrics",
            headers=auth(prof),
            json={"criteria": ROUND_ROBIN_RUBRIC},
        ),
        201,
    )
    deadlock = expect(
        client.post(
            "/assignments",
            headers=auth(prof),
            json={
                "course_id": course["id"],
                "title": "Deadlock Conditions",
                "description": "State the four Coffman conditions and explain one "
                "prevention strategy.",
                "due_date": (now + timedelta(days=14)).isoformat(),
                "max_score": "10",
                "grading_mode": "hybrid",
            },
        ),
        201,
    )
    expect(
        client.post(
            f"/assignments/{deadlock['id']}/rubrics",
            headers=auth(prof),
            json={"criteria": DEADLOCK_RUBRIC},
        ),
        201,
    )

    print("Uploading course material and waiting for it to be indexed...")
    docs = [
        add_course_document(
            prof,
            course["id"],
            rr["id"],
            file_name="lecture-06-cpu-scheduling.txt",
            text=LECTURE_NOTES,
            doc_type="notes",
        ),
        add_course_document(
            prof,
            course["id"],
            rr["id"],
            file_name="round-robin-model-answer.txt",
            text=SAMPLE_SOLUTION,
            doc_type="sample_solution",
        ),
    ]
    wait_for_documents(prof, docs)

    print("Enrolling students and submitting answers...")
    submissions: dict[str, str] = {}
    for key, token in students.items():
        expect(
            client.post(
                "/enrollments/join", headers=auth(token), json={"join_code": course["join_code"]}
            ),
            201,
        )
        name = STUDENTS[key][1].split()[0].lower()
        file_name = f"{name}-round-robin.txt"
        file_key = upload_text(
            token,
            file_name=file_name,
            text=ANSWERS[key],
            doc_type="submission",
            course_id=course["id"],
            assignment_id=rr["id"],
        )
        submission = expect(
            client.post(
                "/submissions",
                headers=auth(token),
                json={
                    "assignment_id": rr["id"],
                    "file_name": file_name,
                    "file_key": file_key,
                    "file_size_bytes": len(ANSWERS[key].encode()),
                },
            ),
            201,
        )
        submissions[key] = submission["id"]

    print("Waiting for AI grading (this takes a minute or two)...")
    evaluations = {key: wait_for_evaluation(prof, sid) for key, sid in submissions.items()}
    for key, evaluation in evaluations.items():
        feedback = evaluation.get("ai_feedback") or {}
        flag = " (placeholder: AI grading failed)" if feedback.get("is_fallback") else ""
        print(
            f"  {STUDENTS[key][1]:<12} {evaluation['ai_score']}/20 "
            f"confidence={feedback.get('confidence_score')}{flag}"
        )

    # Leave a realistic review queue: one approved, one overridden, two pending.
    expect(
        client.post(
            f"/evaluations/{evaluations['excellent']['id']}/approve",
            headers=auth(prof),
            json={"professor_feedback": "Excellent, complete answer."},
        )
    )
    partial_score = float(evaluations["partial"]["ai_score"])
    expect(
        client.post(
            f"/evaluations/{evaluations['partial']['id']}/override",
            headers=auth(prof),
            json={
                "final_score": max(partial_score - 1, 0),
                "professor_feedback": "The claim that a bigger quantum is always better is "
                "incorrect: a very large quantum turns Round Robin into FCFS. Review "
                "Lecture 6.",
            },
        )
    )

    print("\nDemo data ready.")
    print_accounts()


def print_accounts() -> None:
    print(f"  Professor: {PROFESSOR[0]} / {PASSWORD}")
    for email, name in STUDENTS.values():
        print(f"  Student:   {email} / {PASSWORD}  ({name})")


if __name__ == "__main__":
    try:
        main()
    except SeedError as exc:
        sys.exit(f"Seeding failed: {exc}")
