import React, { useState, useEffect, useRef } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { MessageCircle, Send, Loader2, Plus } from "lucide-react";

// Define types for messages
interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface QASession {
  id: number;
  title: string;
  messages: Message[];
  createdAt: string;
}

export function QASection() {
  const { id: videoIdParam } = useParams();
  const videoId = parseInt(videoIdParam || "0");
  const queryClient = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // States
  const [activeConversation, setActiveConversation] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch conversations for this video
  const { data: conversations, isLoading: isLoadingConversations, refetch: refetchConversations } =
    useQuery({
      queryKey: ['/api/videos', videoId, 'qa'],
      queryFn: async () => {
        const response = await axios.get(`/api/videos/${videoId}/qa`);
        return response.data as QASession[];
      },
      enabled: videoId > 0,
    });

  // Fetch active conversation if set
  const { data: conversationData, isLoading: isLoadingConversation, refetch: refetchConversation } =
    useQuery({
      queryKey: ['/api/qa', activeConversation],
      queryFn: async () => {
        if (!activeConversation) return null;
        const response = await axios.get(`/api/qa/${activeConversation}`);
        return response.data;
      },
      enabled: activeConversation !== null,
    });

  // Create a new conversation
  const createConversation = useMutation({
    mutationFn: async (title: string) => {
      const response = await axios.post(`/api/videos/${videoId}/qa`, {
        title
      });
      return response.data;
    },
    onSuccess: (data) => {
      console.log("Conversation created:", data);

      if (data && typeof data === 'object' && 'id' in data && typeof data.id === 'number') {
        // Force refetching conversation list
        refetchConversations();

        // Set the active conversation
        setActiveConversation(data.id);

        // Clear messages array to start fresh
        setMessages([]);
      }
    }
  });

  // Mutation for adding a new message to a conversation
  const addMessage = useMutation({
    mutationFn: async ({ conversationId, content }: { conversationId: number, content: string }) => {
      const response = await axios.post(`/api/qa/${conversationId}/ask`, {
        question: content,
        video_id: videoId
      });
      return response.data;
    },
    onSuccess: (data) => {
      console.log("Message added, response:", data);

      // Update messages with the new AI response
      if (data && data.conversation && Array.isArray(data.conversation.messages)) {
        setMessages(data.conversation.messages);
      }

      // Make sure we're not still in loading state
      setIsSubmitting(false);
    },
    onError: (error) => {
      console.error("Failed to send message:", error);
      setIsSubmitting(false);
    }
  });

  // Update messages when conversation data changes
  useEffect(() => {
    if (conversationData && Array.isArray(conversationData.messages)) {
      setMessages(conversationData.messages);
    }
  }, [conversationData]);

  // Scroll to bottom when new messages are added
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleCreateNewConversation = () => {
    // Create new conversation with a placeholder title based on question
    const title = `Q: ${question.substring(0, 25)}${question.length > 25 ? '...' : ''}`;
    createConversation.mutate(title);
  };

  const handleSelectConversation = (conversationId: number) => {
    setActiveConversation(conversationId);
  };

  const handleSubmitQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || isSubmitting) return;

    // If there's no active conversation, create one first
    if (!activeConversation) {
      handleCreateNewConversation();
      return;
    }

    // Add user message immediately to UI for better UX
    const userMessage: Message = { role: 'user', content: question };
    setMessages([...messages, userMessage]);

    // Set loading state
    setIsSubmitting(true);

    // Send the question to the API
    await addMessage.mutateAsync({
      conversationId: activeConversation,
      content: question
    });

    // Clear the input
    setQuestion("");
  };

  // Render the chat interface
  return (
    <div className="flex flex-col h-full">
      <div className="flex h-full gap-4">
        {/* Conversations sidebar */}
        <div className="w-64 flex-shrink-0 bg-muted/20 rounded-lg p-3 overflow-hidden">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-medium">Conversations</h3>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setActiveConversation(null);
                setMessages([]); //added to clear the messages when creating a new conversation
              }}
              className="h-7 px-2 text-xs"
            >
              <Plus className="h-3 w-3 mr-1" />
              New
            </Button>
          </div>

          <ScrollArea className="h-[calc(100%-40px)]">
            {isLoadingConversations ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : conversations && conversations.length > 0 ? (
              <div className="space-y-1.5">
                {conversations.map((conversation) => (
                  <div
                    key={conversation.id}
                    className={`px-2 py-1.5 text-sm rounded cursor-pointer hover:bg-muted transition-colors ${
                      activeConversation === conversation.id ? 'bg-muted' : ''
                    }`}
                    onClick={() => handleSelectConversation(conversation.id)}
                  >
                    <div className="truncate">
                      {conversation.title}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {new Date(conversation.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-sm text-muted-foreground">
                No conversations yet
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Main chat area */}
        <div className="flex-grow flex flex-col">
          <div className="flex-grow bg-muted/20 rounded-lg p-6 mb-6 overflow-hidden flex flex-col">
            {isLoadingConversation || !conversationData ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="flex-grow flex flex-col">
                <ScrollArea className="flex-grow pr-4">
                  <div className="space-y-6">
                    {messages.map((message, index) => (
                      <div
                        key={index}
                        className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-lg p-4 ${
                            message.role === 'user'
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          <div className="whitespace-pre-wrap">{message.content}</div>
                        </div>
                      </div>
                    ))}
                    {isSubmitting && (
                      <div className="flex justify-start">
                        <div className="max-w-[80%] rounded-lg p-4 bg-muted text-muted-foreground">
                          <div className="flex items-center space-x-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>AI is thinking...</span>
                          </div>
                        </div>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>

          <div className="flex items-start space-x-2 p-4 border-t border-border">
            <Textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask a question about this video..."
              className="flex-grow min-h-[80px]"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmitQuestion(e);
                }
              }}
            />
            <Button
              onClick={handleSubmitQuestion}
              className="flex-shrink-0"
              disabled={!question.trim() || isSubmitting}
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}