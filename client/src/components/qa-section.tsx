import React, { useState, useEffect, useRef } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { MessageCircle, Send, Loader2, Plus, PanelLeftOpen, PanelLeftClose, Trash2, Download, Search } from "lucide-react";
import { ExportButton } from "@/components/export/export-button";
import { SearchDialog } from "@/components/search/search-dialog";
import { highlightText } from "@/lib/highlight-utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Define types for messages
interface Citation {
  id: number;
  video_id: number;
  video_title: string;
  content: string;
  content_type: string;
  timestamp?: string;
  chunk_index?: number;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
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
  const [showSidebar, setShowSidebar] = useState(true);
  const [conversationToDelete, setConversationToDelete] = useState<number | null>(null);

  // CSS classes for the sidebar based on visibility
  const sidebarClasses = showSidebar
    ? "w-1/4 min-w-[250px] border-r border-border h-[calc(100vh-12rem)] overflow-y-auto"
    : "hidden";

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
    // Store the current question to use after conversation is created
    const initialQuestion = question;
    
    // Clear the question input field immediately
    setQuestion("");
    
    createConversation.mutate(title, {
      onSuccess: (data) => {
        // After conversation is created successfully, send the initial question
        if (data && typeof data === 'object' && 'id' in data && typeof data.id === 'number') {
          // Send the initial question to get an answer
          addMessage.mutate({
            conversationId: data.id,
            content: initialQuestion
          });
        }
      }
    });
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

    // Store question content before clearing
    const currentQuestion = question;
    
    // Add user message immediately to UI for better UX
    const userMessage: Message = { role: 'user', content: currentQuestion };
    setMessages([...messages, userMessage]);

    // Clear the input immediately
    setQuestion("");

    // Set loading state
    setIsSubmitting(true);

    // Send the question to the API
    await addMessage.mutateAsync({
      conversationId: activeConversation,
      content: currentQuestion
    });
  };

  const handleNewConversation = () => {
    setActiveConversation(null);
    setMessages([]);
    setShowSidebar(false);
  };

  // Delete conversation function
  const deleteConversation = useMutation({
    mutationFn: async (id: number) => {
      const response = await axios.delete(`/api/qa/${id}`);
      return response.data;
    },
    onSuccess: () => {
      // If we're deleting the active conversation, reset the active conversation
      if (activeConversation === conversationToDelete) {
        setActiveConversation(null);
        setMessages([]);
      }
      
      // Force refetching conversations
      refetchConversations();
      
      // Reset the conversation to delete
      setConversationToDelete(null);
    },
    onError: (error) => {
      console.error("Failed to delete conversation:", error);
      // Reset the conversation to delete even on error
      setConversationToDelete(null);
    }
  });

  const handleDeleteConversation = () => {
    if (conversationToDelete) {
      deleteConversation.mutate(conversationToDelete);
    }
  };

  // Render the chat interface
  return (
    <div className="flex flex-col h-full">
      <div className="flex h-full gap-4">
        {/* Mobile sidebar toggle button */}
        <Button
          variant="outline"
          size="icon"
          onClick={() => setShowSidebar(!showSidebar)}
          className="md:hidden absolute top-2 left-2 z-10"
        >
          <MessageCircle className="h-4 w-4" />
        </Button>

        {/* Conversations sidebar */}
        <div className={`
          ${showSidebar ? 'fixed inset-0 z-50 bg-background/80 backdrop-blur-sm md:hidden' : 'hidden'}
          md:block md:relative md:inset-auto md:z-auto md:bg-transparent md:backdrop-filter-none
        `}>
          <div className={`
            w-64 h-full flex-shrink-0 bg-muted/20 rounded-lg p-3 overflow-hidden 
            fixed left-0 top-0 bottom-0 z-50 transition-transform 
            ${showSidebar ? 'translate-x-0' : '-translate-x-full'} 
            md:relative md:translate-x-0 md:z-auto
          `}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-medium">Conversations</h3>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowSidebar(false)}
                  className="h-7 px-2 text-xs md:hidden"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setActiveConversation(null);
                    setMessages([]); //added to clear the messages when creating a new conversation
                    if (window.innerWidth < 768) setShowSidebar(false);
                  }}
                  className="h-7 px-2 text-xs"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  New
                </Button>
              </div>
            </div>

            <ScrollArea className="h-[calc(100%-40px)]">
              {isLoadingConversations ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : conversations && conversations.length > 0 ? (
                <div className="space-y-1.5">
                  {conversations.map((conversation) => (
                    <div key={conversation.id} className="group">
                    <div
                      key={conversation.id}
                      className={`px-2 py-1.5 text-sm rounded hover:bg-muted transition-colors ${
                        activeConversation === conversation.id ? 'bg-muted' : ''
                      }`}
                    >
                      <div 
                        className="flex justify-between items-start"
                      >
                        <div 
                          className="flex-grow cursor-pointer overflow-hidden mr-1"
                          onClick={() => {
                            handleSelectConversation(conversation.id);
                            if (window.innerWidth < 768) setShowSidebar(false);
                          }}
                        >
                          <div className="truncate">
                            {conversation.title}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {conversation.createdAt ? new Date(conversation.createdAt).toLocaleString('en-US', {
                              year: 'numeric', 
                              month: 'short', 
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            }) : 'No date available'}
                          </div>
                        </div>
                        <button
                          className="text-xs text-red-500 opacity-0 group-hover:opacity-100 hover:opacity-100 focus:opacity-100 p-1 rounded hover:bg-muted-foreground/10 flex-shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConversationToDelete(conversation.id);
                          }}
                          aria-label="Delete conversation"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                        </button>
                      </div>
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
        </div>

        {/* Main chat area */}
        <div className="flex-grow flex flex-col md:pl-0 pl-8">
          <div className="flex-grow bg-muted/20 rounded-lg p-6 mb-6 overflow-hidden flex flex-col">
            <div className="flex justify-between items-center p-2 bg-muted/30 border-b border-border">
              <div>
                {activeConversation && conversationData ? 
                  <span className="text-sm font-medium">{conversationData.title}</span> : 
                  <span className="text-sm text-muted-foreground">No active conversation</span>
                }
              </div>
              <div className="flex gap-2">
                {activeConversation && conversationData && (
                  <ExportButton
                    videoId={videoId}
                    qaConversationId={activeConversation}
                    videoTitle={conversationData.title}
                    small
                  />
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowSidebar(!showSidebar)}
                >
                  {showSidebar ? <PanelLeftClose className="h-4 w-4 mr-2" /> : <PanelLeftOpen className="h-4 w-4 mr-2" />}
                  {showSidebar ? "Hide Conversations" : "Show Conversations"}
                </Button>
              </div>
            </div>
            {activeConversation ? (
              isLoadingConversation ? (
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
                          
                          {/* Citation section */}
                          {message.role === 'assistant' && message.citations && message.citations.length > 0 && (
                            <div className="mt-3 pt-2 border-t border-border">
                              <div className="text-xs font-medium mb-1.5">Sources cited:</div>
                              <div className="flex flex-col gap-2">
                                {message.citations.map((citation, idx) => (
                                  <div key={idx} className="text-xs p-2 bg-muted/50 rounded border border-border/60 shadow-sm">
                                    <div className="flex items-center gap-1.5 mb-1.5">
                                      <span className="font-medium text-primary/90 bg-primary/10 px-1.5 py-0.5 rounded-sm">[{idx + 1}]</span>
                                      {citation.timestamp && (
                                        <button 
                                          className="text-primary hover:underline flex items-center gap-1 bg-primary/5 px-2 py-0.5 rounded-sm transition-colors hover:bg-primary/10"
                                          onClick={() => {
                                            // Create URL with timestamp parameter
                                            const timestampInSeconds = citation.timestamp 
                                              ? citation.timestamp.split(':').reduce((acc, time) => (60 * acc) + +time, 0)
                                              : 0;
                                            window.open(`https://youtube.com/watch?v=${videoIdParam}&t=${timestampInSeconds}s`, '_blank');
                                          }}
                                          title="Jump to this timestamp on YouTube"
                                        >
                                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>
                                          {citation.timestamp}
                                        </button>
                                      )}
                                      <span className="text-muted-foreground text-xs ml-auto">
                                        {citation.content_type === 'transcript' ? 'Transcript' : 
                                         citation.content_type === 'summary' ? 'Summary' : 
                                         citation.content_type === 'note' ? 'Note' : 'Content'}
                                      </span>
                                    </div>
                                    <div className="opacity-90 italic bg-background/50 p-1.5 rounded border-l-2 border-primary/30">"{citation.content}"</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
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
            )
            ) : (
              <div className="flex items-center justify-center h-48 flex-col">
                <MessageCircle className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-lg text-muted-foreground">No active conversation</p>
                <p className="text-sm text-muted-foreground mt-1">Type a question below to start a new conversation</p>
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

      {/* Delete Confirmation Modal */}
      <Dialog open={conversationToDelete !== null} onOpenChange={(open) => !open && setConversationToDelete(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Conversation</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this conversation? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setConversationToDelete(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDeleteConversation}
              disabled={deleteConversation.isPending}
            >
              {deleteConversation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}