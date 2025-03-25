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
  const [newConversationTitle, setNewConversationTitle] = useState("");
  const [isCreatingConversation, setIsCreatingConversation] = useState(false);
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

  // Get the active conversation
  const { data: conversationData, isLoading: isLoadingConversation, refetch: refetchConversation } = useQuery({
    queryKey: ['/api/qa', activeConversation],
    queryFn: async () => {
      if (activeConversation === null) return { 
        id: 0,
        title: '',
        video_id: videoId,
        user_id: 0,
        messages: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      try {
        const result = await apiRequest('GET', `/api/qa/${activeConversation}`);
        // Ensure the result is an object with a messages array
        if (result && typeof result === 'object') {
          // Create a properly typed conversation object with a safe messages array
          const safeResult = result as Partial<Conversation>;
          const messages = safeResult.messages && Array.isArray(safeResult.messages) 
            ? safeResult.messages 
            : [];

          return {
            id: typeof safeResult.id === 'number' ? safeResult.id : 0,
            title: safeResult.title || '',
            video_id: typeof safeResult.video_id === 'number' ? safeResult.video_id : videoId,
            user_id: typeof safeResult.user_id === 'number' ? safeResult.user_id : 0,
            messages: messages,
            created_at: safeResult.created_at || new Date().toISOString(),
            updated_at: safeResult.updated_at || new Date().toISOString()
          };
        }

        // Return a default conversation if result is not valid
        return { 
          id: 0,
          title: '',
          video_id: videoId,
          user_id: 0,
          messages: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
      } catch (error) {
        console.error("Error fetching conversation:", error);
        // Return a default conversation on error
        return { 
          id: 0,
          title: '',
          video_id: videoId,
          user_id: 0,
          messages: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
      }
    },
    enabled: activeConversation !== null,
  });

  // Ensure currentConversation is properly initialized with default values
  const currentConversation: Conversation = conversationData || { 
    id: 0,
    title: '',
    video_id: videoId,
    user_id: 0,
    messages: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  // Ensure messages is always an array
  const messages: Message[] = Array.isArray(currentConversation.messages) ? currentConversation.messages : [];

  // Mutation to create a new conversation
  const createConversationMutation = useMutation({
    mutationFn: (title: string) => apiRequest(
      'POST',
      `/api/videos/${videoId}/qa`,
      { title, messages: [] }
    ),
    onSuccess: (data) => {
      // First clear the form state
      setIsCreatingConversation(false);
      setNewConversationTitle("");

      console.log("Conversation created:", data);

      // Ensure we have a valid conversation ID
      if (data && typeof data === 'object' && 'id' in data && typeof data.id === 'number') {
        // Force refetching the conversation list first
        queryClient.invalidateQueries({ queryKey: ['/api/videos', videoId, 'qa'] });
        
        // Set the active conversation ID 
        setActiveConversation(data.id);
        
        // Force refetch the specific conversation
        queryClient.invalidateQueries({ queryKey: ['/api/qa', data.id] });

        // Explicitly force a refetch of the conversation data with a longer delay
        setTimeout(() => {
          console.log("Refetching conversation:", data.id);
          refetchConversation();
        }, 500);
      }
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
    mutationFn: (data: { conversationId: number, question: string }) => apiRequest(
      'POST',
      `/api/qa/${data.conversationId}/ask`,
      { question: data.question }
    ),
    onSuccess: (data) => {
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
  const handleSendQuestion = () => {
    if (!question.trim() || activeConversation === null) return;

    askQuestionMutation.mutate({
      conversationId: activeConversation,
      question: question.trim()
    });
  };

  // Handle creating a new conversation
  const handleCreateConversation = () => {
    if (!newConversationTitle.trim()) {
      toast({
        title: "Error",
        description: "Please enter a title for the conversation.",
        variant: "destructive",
      });
      return;
    }

    createConversationMutation.mutate(newConversationTitle.trim());
  };

  // Handle pressing Enter in the question input
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendQuestion();
    }
  };

  // Format timestamp to show only time
  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  useEffect(() => {
    if (activeConversation) {
      // When a conversation becomes active, explicitly refetch it
      refetchConversation();

      // Scroll to bottom of messages after a short delay
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 200);
    }
  }, [activeConversation, refetchConversation]);

  return (
    <div className="flex flex-col md:flex-row md:gap-4 h-full">
      {/* Sidebar with conversations list */}
      <div className="w-full md:w-64 space-y-4 mb-4 md:mb-0">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium">Conversations</h3>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setIsCreatingConversation(true)}
            disabled={isCreatingConversation}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {isCreatingConversation && (
          <div className="flex flex-col space-y-2 p-2 border rounded-md">
            <Input
              placeholder="Conversation title"
              value={newConversationTitle}
              onChange={(e) => setNewConversationTitle(e.target.value)}
              className="text-sm"
            />
            <div className="flex justify-end space-x-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setIsCreatingConversation(false)}
              >
                Cancel
              </Button>
              <Button 
                size="sm" 
                onClick={handleCreateConversation}
                disabled={createConversationMutation.isPending}
              >
                {createConversationMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : "Create"}
              </Button>
            </div>
          </div>
        )}

        {isLoadingConversations ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : conversations.length === 0 ? (
          <div className="text-center py-4 text-sm text-muted-foreground">
            No conversations yet.
            <br />
            Start a new Q&A session by clicking the + button.
          </div>
        ) : (
          <ScrollArea className="h-[300px]">
            <div className="space-y-2">
              {conversations.map((conversation: Conversation) => (
                <Card
                  key={conversation.id}
                  className={`p-2 cursor-pointer hover:bg-accent ${
                    activeConversation === conversation.id ? "bg-accent" : ""
                  }`}
                  onClick={() => setActiveConversation(conversation.id)}
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
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete conversation</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete this conversation? This action cannot be undone.
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
                  <div className="text-xs text-muted-foreground mt-1">
                    {new Date(conversation.created_at).toLocaleDateString()}
                  </div>
                </Card>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Main conversation area */}
      <div className="flex-1 flex flex-col">
        {activeConversation !== null && conversationData && (
          <>
            {/* Message display area */}
            <ScrollArea className="flex-1 h-[300px] border rounded-md p-4 mb-4">
              {isLoadingConversation ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : messages.length > 0 ? (
                <div className="space-y-6">
                  {messages.map((message: Message, index: number) => (
                    <div
                      key={index}
                      className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-lg p-3 ${
                          message.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted"
                        }`}
                      >
                        <div className="text-sm whitespace-pre-wrap">{message.content}</div>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                  <MessageCircle className="h-10 w-10 mb-2 opacity-20" />
                  <p>Ask a question about this video</p>
                </div>
              )}
            </ScrollArea>

            {/* Input area */}
            <div className="flex items-center gap-2">
              <Input
                placeholder="Ask a question about this video..."
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={activeConversation === null || askQuestionMutation.isPending}
                className="flex-1"
              />
              <Button
                onClick={handleSendQuestion}
                disabled={!question.trim() || activeConversation === null || askQuestionMutation.isPending}
              >
                {askQuestionMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </>
        )}
        
        {activeConversation === null && (
          <div className="flex flex-col items-center justify-center h-[400px] text-center border rounded-md p-4">
            <MessageCircle className="h-12 w-12 mb-4 opacity-20" />
            <h3 className="text-lg font-medium mb-2">No Active Conversation</h3>
            <p className="text-muted-foreground mb-6 max-w-md">
              Select an existing conversation from the sidebar or create a new one to start
              asking questions about this video.
            </p>
            <Button
              onClick={() => setIsCreatingConversation(true)}
              disabled={isCreatingConversation}
            >
              <Plus className="h-4 w-4 mr-2" />
              New Conversation
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}