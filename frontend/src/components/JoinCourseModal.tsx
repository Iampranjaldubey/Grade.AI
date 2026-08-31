import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import * as api from "@/lib/api";
import { getErrorMessage } from "@/lib/api";
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Input,
} from "@/components/ui";

const joinCodeSchema = z.object({
  join_code: z.string().min(1, "Join code is required").toUpperCase(),
});

type JoinCodeFormData = z.infer<typeof joinCodeSchema>;

interface JoinCourseModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function JoinCourseModal({ isOpen, onClose }: JoinCourseModalProps) {
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<JoinCodeFormData>({ resolver: zodResolver(joinCodeSchema) });

  const joinMutation = useMutation({
    mutationFn: (data: { join_code: string }) => api.joinCourse(data),
    onSuccess: (enrollment) => {
      queryClient.invalidateQueries({ queryKey: ["my-courses"] });
      toast.success(`Joined ${enrollment.course.course_name}`);
      reset();
      onClose();
    },
    onError: (error: unknown) =>
      toast.error(getErrorMessage(error, "Failed to join course")),
  });

  const handleOpenChange = (open: boolean) => {
    if (open || joinMutation.isPending) return;
    reset();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent size="sm">
        <form
          onSubmit={handleSubmit((data) => joinMutation.mutate({ join_code: data.join_code }))}
          noValidate
        >
          <DialogHeader>
            <DialogTitle>Join a course</DialogTitle>
            <DialogDescription>
              Enter the code your professor shared with you.
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
            <Field
              label="Course join code"
              htmlFor="join_code"
              required
              error={errors.join_code?.message}
            >
              <Input
                {...register("join_code")}
                id="join_code"
                autoComplete="off"
                autoCapitalize="characters"
                maxLength={8}
                placeholder="ABC123"
                invalid={!!errors.join_code}
                aria-describedby={errors.join_code ? "join_code-error" : undefined}
                className="h-14 text-center font-mono text-2xl font-bold uppercase tracking-[0.3em]"
              />
            </Field>
          </DialogBody>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleOpenChange(false)}
              disabled={joinMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" isLoading={joinMutation.isPending}>
              Join course
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
