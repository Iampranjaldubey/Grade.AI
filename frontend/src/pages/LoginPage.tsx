import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff } from "lucide-react";
import toast from "react-hot-toast";
import { useAuthStore } from "@/store/authStore";
import { cn } from "@/lib/utils";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AcademicHero } from "@/components/auth/AcademicHero";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormData = z.infer<typeof loginSchema>;

const inputClass =
  "block w-full rounded-[2px] border bg-paper-2 px-3.5 py-2.5 font-sans text-[15px] text-ink placeholder:text-muted focus:border-oxblood focus:outline-none focus:ring-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-oxblood focus-visible:outline-offset-1 motion-safe:transition-colors";
const labelClass = "mb-1.5 block font-sans text-[13px] font-medium text-ink-soft";
const iconButtonClass =
  "absolute right-3 top-1/2 -translate-y-1/2 rounded-[2px] text-muted hover:text-ink-soft focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-oxblood focus-visible:outline-offset-2 motion-safe:transition-colors";
const errorTextClass = "mt-1.5 font-sans text-[13px] text-oxblood-dark";

const loginBullets = [
  "Scored against your exact rubric criteria",
  "Every AI judgment shown, not hidden",
  "You approve or override — always",
];

function LoginStory() {
  return (
    <>
      <h1 className="font-serif text-3xl font-semibold leading-[1.15] text-paper min-[900px]:text-[40px]">
        Every grade traces back to your rubric, not a black box.
      </h1>
      <p className="mt-5 max-w-md font-sans text-[15px] leading-relaxed text-rule">
        GradeAI drafts a score and detailed feedback from your assignment rubric and course
        materials. Nothing reaches a student until you review it.
      </p>

      {/* Bullets are hidden on the short stacked (mobile) story panel */}
      <div className="hidden min-[900px]:block">
        <ul className="mt-7 space-y-3">
          {loginBullets.map((point) => (
            <li key={point} className="flex items-start gap-3 font-sans text-[14px] text-rule">
              <span
                aria-hidden="true"
                className="mt-[7px] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-oxblood"
              />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </div>

      <AcademicHero className="mt-8 w-full max-w-[210px] min-[900px]:mt-10 min-[900px]:max-w-[340px]" />
    </>
  );
}

export function LoginPage() {
  const navigate = useNavigate();
  const { login, isAuthenticated, user, isLoading, error, clearError } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  useEffect(() => {
    if (isAuthenticated && user) {
      const dashboardPath =
        user.role === "professor" ? "/professor/dashboard" : "/student/dashboard";
      navigate(dashboardPath, { replace: true });
    }
  }, [isAuthenticated, user, navigate]);

  useEffect(() => {
    if (error) {
      toast.error(error);
      clearError();
    }
  }, [error, clearError]);

  const onSubmit = async (data: LoginFormData) => {
    try {
      await login(data.email, data.password);
      toast.success("Welcome back!");
    } catch {
      // Error handled in store and toast
    }
  };

  return (
    <AuthLayout story={<LoginStory />}>
      <div className="mb-8">
        <h2 className="font-serif text-2xl font-semibold text-ink">Sign in</h2>
        <p className="mt-1 font-sans text-sm text-muted">
          Welcome back. Pick up where you left off.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* Email field */}
        <div>
          <label htmlFor="email" className={labelClass}>
            Email address
          </label>
          <input
            {...register("email")}
            id="email"
            type="email"
            autoComplete="email"
            className={cn(inputClass, errors.email ? "border-oxblood" : "border-rule")}
            placeholder="you@example.com"
          />
          {errors.email && <p className={errorTextClass}>{errors.email.message}</p>}
        </div>

        {/* Password field */}
        <div>
          <label htmlFor="password" className={labelClass}>
            Password
          </label>
          <div className="relative">
            <input
              {...register("password")}
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              className={cn(inputClass, "pr-12", errors.password ? "border-oxblood" : "border-rule")}
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className={iconButtonClass}
            >
              {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>
          {errors.password && <p className={errorTextClass}>{errors.password.message}</p>}
        </div>

        {/* Submit button */}
        <button
          type="submit"
          disabled={isLoading}
          className="flex w-full items-center justify-center rounded-[2px] bg-oxblood px-4 py-2.5 font-sans text-[15px] font-semibold text-paper-2 hover:bg-oxblood-dark focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-oxblood-dark focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60 motion-safe:transition-colors"
        >
          {isLoading ? (
            <>
              <span className="mr-2 h-5 w-5 rounded-full border-2 border-paper-2/40 border-t-paper-2 motion-safe:animate-spin" />
              Signing in...
            </>
          ) : (
            "Sign in"
          )}
        </button>
      </form>

      {/* Register link */}
      <p className="mt-6 text-center font-sans text-sm text-muted">
        Don't have an account?{" "}
        <Link
          to="/register"
          className="rounded-[1px] font-semibold text-oxblood-dark underline-offset-2 hover:underline focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-oxblood focus-visible:outline-offset-2"
        >
          Sign up
        </Link>
      </p>
    </AuthLayout>
  );
}
