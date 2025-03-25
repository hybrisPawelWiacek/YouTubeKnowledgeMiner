import React, { useState, useEffect, useRef } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { MessageCircle, Send, Loader2 } from "lucide-react";

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
      const response = await axios.post('/api/qa', {
        videoId,
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

  // Add message to conversation
  const addMessage = useMutation({
    mutationFn: async ({ conversationId, content }: { conversationId: number, content: string }) => {
      const response = await axios.post(`/api/qa/${conversationId}/messages`, { content });
      return response.data;
    },
    onSuccess: () => {
      // Force refetch conversation data to get the updated messages
      refetchConversation();
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

  // Handle submitting a question
  const handleSubmitQuestion = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!question.trim()) return;

    // Create a new conversation if there's no active one
    if (!activeConversation) {
      const title = `Q: ${question.slice(0, 30)}${question.length > 30 ? '...' : ''}`;
      createConversation.mutate(title);

      // Update UI immediately with user message
      setMessages([...messages, { role: 'user', content: question }]);
      setIsSubmitting(true);

      // We'll handle the actual message submission after the conversation is created
      // in the useEffect below
    } else {
      // Update UI immediately with user message
      const updatedMessages = [...messages, { role: 'user', content: question }];
      setMessages(updatedMessages);
      setIsSubmitting(true);

      // Submit the message to the API
      await addMessage.mutateAsync({ 
        conversationId: activeConversation,
        content: question
      });
    }

    // Clear the input
    setQuestion("");
  };

  // Watch for activeConversation changes to submit the first message
  useEffect(() => {
    const submitFirstMessage = async () => {
      if (activeConversation && isSubmitting && messages.length > 0) {
        const lastUserMessage = messages.find(m => m.role === 'user')?.content;

        if (lastUserMessage) {
          await addMessage.mutateAsync({
            conversationId: activeConversation,
            content: lastUserMessage
          });
          setIsSubmitting(false);
        }
      }
    };

    submitFirstMessage();
  }, [activeConversation, isSubmitting]);

  // Render the chat interface
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 flex flex-col overflow-hidden">
        <ScrollArea className="flex-1 p-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-center">
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
                        ? 'bg-primary text-primary-foreground' 
                        : 'bg-muted'
                    }`}
                  >
                    <div className="text-sm whitespace-pre-wrap">{message.content}</div>
                  </div>
                </div>
              ))}
              {isSubmitting && (
                <div className="flex justify-start">
                  <div className="rounded-lg px-4 py-2 bg-muted">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </ScrollArea>

        {/* Question input form */}
        <form onSubmit={handleSubmitQuestion} className="p-4 border-t border-border">
          <div className="flex space-x-2">
            <Textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask a question about this video..."
              className="flex-1 min-h-[60px] resize-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmitQuestion(e);
                }
              }}
            />
            <Button type="submit" disabled={isSubmitting || !question.trim()}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Press Enter to send, Shift+Enter for a new line
          </p>
        </form>
      </div>
    </div>
  );
}