import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import styles from "./DashboardPage.module.css";

export function DashboardPage() {
  const { user, isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return <p>Loading dashboard…</p>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <section className={styles.dashboard}>
      <h1>Dashboard</h1>
      <p className={styles.greeting}>
        Welcome back{user?.name ? `, ${user.name}` : ""}.
      </p>
      <div className={styles.grid}>
        <article className={styles.card}>
          <h2>Assignments</h2>
          <p>Create and manage grading assignments.</p>
        </article>
        <article className={styles.card}>
          <h2>Submissions</h2>
          <p>Review student submissions and AI-generated scores.</p>
        </article>
        <article className={styles.card}>
          <h2>Rubrics</h2>
          <p>Define criteria for consistent, transparent grading.</p>
        </article>
      </div>
    </section>
  );
}
