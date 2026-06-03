import { Link } from "react-router-dom";
import { useHealth } from "@/hooks/useHealth";
import { Button } from "@/components/Button";
import styles from "./HomePage.module.css";

export function HomePage() {
  const { data: health, isLoading, isError } = useHealth();

  return (
    <section className={styles.hero}>
      <h1>Grade student work with AI</h1>
      <p className={styles.subtitle}>
        Upload assignments, define rubrics, and let GradeAI deliver consistent,
        explainable feedback at scale.
      </p>
      <div className={styles.actions}>
        <Link to="/login">
          <Button>Get started</Button>
        </Link>
        <Link to="/dashboard">
          <Button variant="secondary">View dashboard</Button>
        </Link>
      </div>
      <div className={styles.status}>
        {isLoading && <span>Checking API status…</span>}
        {isError && <span className={styles.error}>API unreachable</span>}
        {health && (
          <span>
            API {health.status} · v{health.version} · {health.environment}
          </span>
        )}
      </div>
    </section>
  );
}
