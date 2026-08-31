import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, Users, BookOpen } from "lucide-react";
import toast from "react-hot-toast";
import { useAuthStore } from "@/store/authStore";
import { cn } from "@/lib/utils";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AcademicHero } from "@/components/auth/AcademicHero";

const registerSchema = z
  .object({
    name: z.string().min(1, "Full name is required"),
    email: z.string().email("Invalid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
    role: z.enum(["professor", "student"]),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

type RegisterFormData = z.infer<typeof registerSchema>;

const inputClass =
  "block w-full rounded-[2px] border bg-paper-2 px-3.5 py-2.5 font-sans text-[15px] text-ink placeholder:text-muted focus:border-oxblood focus:outline-none focus:ring-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-oxblood focus-visible:outline-offset-1 motion-safe:transition-colors";
const labelClass = "mb-1.5 block font-sans text-[13px] font-medium text-ink-soft";
const iconButtonClass =
  "absolute right-3 top-1/2 -translate-y-1/2 rounded-[2px] text-muted hover:text-ink-soft focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-oxblood focus-visible:outline-offset-2 motion-safe:transition-colors";
const errorTextClass = "mt-1.5 font-sans text-[13px] text-oxblood-dark";

function RegisterStory() {
  return (
    <>
      <h1 className="font-serif text-3xl font-semibold leading-[1.15] text-paper min-[900px]:text-[38px]">
        Set up your grading workspace.
      </h1>
      <p className="mt-5 max-w-md font-sans text-[15px] leading-relaxed text-rule">
        Create your account to build rubric-based assignments and review every AI-drafted grade
        before it reaches a student.
      </p>
      <AcademicHero className="mt-8 w-full max-w-[210px] min-[900px]:mt-10 min-[900px]:max-w-[320px]" />
    </>
  );
}

export function RegisterPage() {
  const navigate = useNavigate();
  const {
    register: registerUser,
    isAuthenticated,
    user,
    isLoading,
    error,
    clearError,
  } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [selectedRole, setSelectedRole] = useState<"professor" | "student">("student");

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      role: "student",
    },
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

  const handleRoleSelect = (role: "professor" | "student") => {
    setSelectedRole(role);
    setValue("role", role);
  };

  const onSubmit = async (data: RegisterFormData) => {
    try {
      await registerUser(data.name, data.email, data.password, data.role);
      toast.success("Account created successfully!");
    } catch {
      // Error handled in store and toast
    }
  };

  const roleCardClass = (active: boolean) =>
    cn(
      "flex flex-col items-center rounded-[2px] border p-5 text-center focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-oxblood focus-visible:outline-offset-2 motion-safe:transition-colors",
      active ? "border-oxblood bg-oxblood/[0.06]" : "border-rule bg-paper-2 hover:border-ink-soft",
    );

  return (
    <AuthLayout story={<RegisterStory />} wide>
      <div className="mb-8">
        <h2 className="font-serif text-2xl font-semibold text-ink">Create your account</h2>
        <p className="mt-1 font-sans text-sm text-muted">Join GradeAI today.</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* Role selection */}
        <div>
          <span className={labelClass}>I am a...</span>
          <div className="grid grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => handleRoleSelect("professor")}
              aria-pressed={selectedRole === "professor"}
              className={roleCardClass(selectedRole === "professor")}
            >
              <BookOpen
                className={cn(
                  "mb-3 h-7 w-7",
                  selectedRole === "professor" ? "text-oxblood" : "text-muted",
                )}
              />
              <span className="font-sans text-base font-semibold text-ink">Professor</span>
              <span className="mt-1 font-sans text-[13px] text-muted">
                Create and manage courses
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleRoleSelect("student")}
              aria-pressed={selectedRole === "student"}
              className={roleCardClass(selectedRole === "student")}
            >
              <Users
                className={cn(
                  "mb-3 h-7 w-7",
                  selectedRole === "student" ? "text-oxblood" : "text-muted",
                )}
              />
              <span className="font-sans text-base font-semibold text-ink">Student</span>
              <span className="mt-1 font-sans text-[13px] text-muted">Enroll in courses</span>
            </button>
          </div>
          <input type="hidden" {...register("role")} />
        </div>

        {/* Name field */}
        <div>
          <label htmlFor="name" className={labelClass}>
            Full Name
          </label>
          <input
            {...register("name")}
            id="name"
            type="text"
            autoComplete="name"
            className={cn(inputClass, errors.name ? "border-oxblood" : "border-rule")}
            placeholder="John Doe"
          />
          {errors.name && <p className={errorTextClass}>{errors.name.message}</p>}
        </div>

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

        <div className="grid gap-5 md:grid-cols-2">
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
                autoComplete="new-password"
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

          {/* Confirm password field */}
          <div>
            <label htmlFor="confirmPassword" className={labelClass}>
              Confirm Password
            </label>
            <div className="relative">
              <input
                {...register("confirmPassword")}
                id="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                autoComplete="new-password"
                className={cn(
                  inputClass,
                  "pr-12",
                  errors.confirmPassword ? "border-oxblood" : "border-rule",
                )}
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                className={iconButtonClass}
              >
                {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
            {errors.confirmPassword && (
              <p className={errorTextClass}>{errors.confirmPassword.message}</p>
            )}
          </div>
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
              Creating account...
            </>
          ) : (
            "Create account"
          )}
        </button>
      </form>

      {/* Login link */}
      <p className="mt-6 text-center font-sans text-sm text-muted">
        Already have an account?{" "}
        <Link
          to="/login"
          className="rounded-[1px] font-semibold text-oxblood-dark underline-offset-2 hover:underline focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-oxblood focus-visible:outline-offset-2"
        >
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
