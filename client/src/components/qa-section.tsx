import React, { useState, useRef, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  MessageCircle,
  Send,
  Loader2,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface QASectionProps {
  videoId: number;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface Conversation {
  id: number;
  title: string;
  video_id: number;
  user_id: number;
  messages: Message[];
  created_at: string;
  updated_at: string;
}

export function QASection({ videoId }: QASectionProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeConversation, setActiveConversation] = useState<number | null>(null);
  const [question, setQuestion] = useState("");
  const [showConversationsList, setShowConversationsList] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch conversations for this video
  const { data, isLoading: isLoadingConversations } = useQuery<Conversation[]>({
    queryKey: ['/api/videos', videoId, 'qa'],
    queryFn: async () => {
      try {
        const result = await apiRequest('GET', `/api/videos/${videoId}/qa`);
        return Array.isArray(result) ? result : [];
      } catch (error) {
        console.error("Error fetching conversations:", error);
        return [];
      }
    },
  });

  // Ensure conversations is always an array
  const conversations: Conversation[] = Array.isArray(data) ? data : [];

  // Fetch active conversation messages
  const { data: activeConversationData, isLoading: isLoadingConversation, refetch: refetchConversation } = useQuery<Conversation>({
    queryKey: ['/api/qa', activeConversation],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/qa/${activeConversation}`);
      return response;
    },
    enabled: activeConversation !== null,
  });

  // Scroll to bottom of messages when new ones are added
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeConversationData?.messages]);

  // Mutation to create a new conversation
  const createConversationMutation = useMutation({
    mutationFn: (title: string) => apiRequest(
      'POST',
      `/api/videos/${videoId}/qa`,
      { title: title || `Conversation ${new Date().toLocaleString()}`, messages: [] }
    ),
    onSuccess: (data) => {
      console.log("Conversation created:", data);

      // Set the active conversation ID 
      setActiveConversation(data.id);

      // Force refetch the specific conversation
      queryClient.invalidateQueries({ queryKey: ['/api/qa', data.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/videos', videoId, 'qa'] });

      // Ensure we're in chat view
      setShowConversationsList(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `Failed to create conversation: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  // Mutation to delete a conversation
  const deleteConversationMutation = useMutation({
    mutationFn: (conversationId: number) => apiRequest(
      'DELETE',
      `/api/qa/${conversationId}`
    ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/videos', videoId, 'qa'] });
      setActiveConversation(null);
      toast({
        title: "Conversation deleted",
        description: "The conversation has been removed.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `Failed to delete conversation: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  // Mutation to ask a question
  const askQuestionMutation = useMutation({
    mutationFn: async (data: { question: string }) => {
      // If no active conversation, create one first
      if (activeConversation === null) {
        const newConversation = await createConversationMutation.mutateAsync(`Q&A ${new Date().toLocaleTimeString()}`);
        const conversationId = newConversation.id;

        // Now ask the question in the new conversation
        return apiRequest(
          'POST',
          `/api/qa/${conversationId}/ask`,
          { question: data.question }
        );
      }

      // If conversation exists, just ask the question
      return apiRequest(
        'POST',
        `/api/qa/${activeConversation}/ask`,
        { question: data.question }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/qa', activeConversation] });
      setQuestion("");

      // Scroll to bottom of messages after a short delay to allow for rendering
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `Failed to ask question: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  // Handle sending a question
  const handleSendQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    if (question.trim()) {
      askQuestionMutation.mutate({ question: question.trim() });
    }
  };

  // Determine which conversation to show in the main chat area
  const currentConversation = activeConversationData;
  const messages = currentConversation?.messages || [];

  return (
    <div className="flex flex-col h-[500px] border rounded-md">
      <div className="flex items-center justify-between p-4 border-b">
        {showConversationsList ? (
          <h3 className="text-lg font-medium">Conversations</h3>
        ) : (
          <div className="flex items-center space-x-2">
            <Button 
              variant="ghost" 
              size="sm" 
              className="p-0 h-8 w-8"
              onClick={() => setShowConversationsList(true)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h3 className="text-lg font-medium">
              {currentConversation?.title || "New Conversation"}
            </h3>
          </div>
        )}

        {!showConversationsList && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setActiveConversation(null);
              setQuestion("");
            }}
          >
            New Chat
          </Button>
        )}
      </div>

      {showConversationsList ? (
        <div className="flex-1 overflow-auto p-4">
          <div className="flex justify-between items-center mb-4">
            <h4 className="text-sm font-medium">Your Conversations</h4>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => {
                setActiveConversation(null);
                setShowConversationsList(false);
                setQuestion("");
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              New Chat
            </Button>
          </div>

          {isLoadingConversations ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="text-center py-4 text-sm text-muted-foreground">
              No conversations yet.
              <br />
              Start a new chat by clicking the New Chat button.
            </div>
          ) : (
            <ScrollArea className="h-[380px]">
              <div className="space-y-2">
                {conversations.map((conversation: Conversation) => (
                  <Card
                    key={conversation.id}
                    className={`p-3 cursor-pointer hover:bg-accent transition-colors ${
                      activeConversation === conversation.id ? "bg-accent" : ""
                    }`}
                    onClick={() => {
                      setActiveConversation(conversation.id);
                      setShowConversationsList(false);
                    }}
                  >
                    <div className="flex justify-between items-center">
                      <div className="truncate text-sm font-medium">
                        {conversation.title || `Conversation ${conversation.id}`}
                      </div>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 opacity-50 hover:opacity-100"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Conversation</AlertDialogTitle>
                            <AlertDialogDescription>
                              This action cannot be undone. This will permanently delete this
                              conversation and all of its messages.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteConversationMutation.mutate(conversation.id)}
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                    <div className="mt-1 text-xs text-gray-400">
                      {new Date(conversation.updated_at).toLocaleString()}
                    </div>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-auto p-4">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <MessageCircle className="h-12 w-12 mb-4 opacity-20" />
                <h3 className="text-lg font-medium mb-2">Ask a Question</h3>
                <p className="text-sm text-gray-400 max-w-md">
                  Start by asking a question about the video content. The AI will analyze the transcript and provide an answer.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((message, index) => (
                  <div 
                    key={index} 
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div 
                      className={`rounded-lg px-4 py-2 max-w-[80%] ${
                        message.role === 'user' 
                          ? 'bg-primary text-primary-foreground ml-auto' 
                          : 'bg-muted'
                      }`}
                    >
                      <div className="text-sm whitespace-pre-wrap">{message.content}</div>
                    </div>
                  </div>
                ))}
                {askQuestionMutation.isPending && (
                  <div className="flex justify-start">
                    <div className="bg-muted rounded-lg px-4 py-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          <form 
            onSubmit={handleSendQuestion} 
            className="p-4 border-t flex items-center gap-2"
          >
            <Input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask a question about the video..."
              className="flex-1"
              disabled={askQuestionMutation.isPending}
            />
            <Button 
              type="submit"
              disabled={!question.trim() || askQuestionMutation.isPending}
            >
              {askQuestionMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </form>
        </>
      )}
    </div>
  );
}