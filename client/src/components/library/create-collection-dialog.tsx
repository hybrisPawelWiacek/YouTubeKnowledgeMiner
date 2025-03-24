import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { FolderPlus } from "lucide-react";

interface CreateCollectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const formSchema = z.object({
  name: z.string()
    .min(2, "Collection name must be at least 2 characters")
    .max(50, "Collection name must be less than 50 characters"),
  description: z.string().max(500, "Description must be less than 500 characters").optional(),
});

type FormValues = z.infer<typeof formSchema>;

export function CreateCollectionDialog({ isOpen, onClose, onSuccess }: CreateCollectionDialogProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
    },
  });
  
  const createCollection = useMutation({
    mutationFn: async (data: FormValues) => {
      const response = await apiRequest("POST", "/api/collections", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Collection created",
        description: "Your new collection has been created successfully.",
      });
      form.reset();
      queryClient.invalidateQueries({ queryKey: ["/api/collections"] });
      onSuccess();
      onClose();
    },
    onError: (error) => {
      toast({
        title: "Failed to create collection",
        description: "An error occurred while creating your collection. Please try again.",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsSubmitting(false);
    }
  });
  
  const onSubmit = (data: FormValues) => {
    setIsSubmitting(true);
    createCollection.mutate(data);
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-white">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="bg-primary/10 p-2 rounded-lg">
              <FolderPlus className="h-5 w-5 text-primary" />
            </div>
            <div>
              <DialogTitle>Create New Collection</DialogTitle>
              <DialogDescription className="text-gray-400">
                Collections help you organize your videos into meaningful groups.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Collection Name</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Enter collection name" 
                      {...field} 
                      className="bg-zinc-800 border-zinc-700"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (Optional)</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Enter a brief description" 
                      {...field} 
                      className="bg-zinc-800 border-zinc-700 resize-none"
                      rows={3}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <DialogFooter className="pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="bg-zinc-800 border-zinc-700"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={isSubmitting}
              >
                {isSubmitting ? "Creating..." : "Create Collection"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}