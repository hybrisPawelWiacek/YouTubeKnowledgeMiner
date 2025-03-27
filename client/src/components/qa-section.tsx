import React, { useState, useEffect, useRef } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  MessageCircle,
  Send,
  Loader2,
  Plus,
  PanelLeftOpen,
  PanelLeftClose,
  Trash2,
  Download,
  Search,
} from "lucide-react";
import { ExportButton } from "@/components/export/export-button";
import { SearchDialog } from "@/components/search/search-dialog";
import { highlightText } from "@/lib/highlight-utils";
import { apiRequest } from "@/lib/api";
import { fetchAPI } from "@/lib/api-helper";
import { getOrCreateAnonymousSessionId } from "@/lib/anonymous-session";
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
  role: "user" | "assistant";
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
  const [activeConversation, setActiveConversation] = useState<number | null>(
    null,
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [currentQuestion, setCurrentQuestion] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSidebar, setShowSidebar] = useState(() => {
    // Check if window is available (client-side only)
    if (typeof window !== "undefined") {
      // Show sidebar by default on desktop (width >= 768px)
      return window.innerWidth >= 768;
    }
    return true; // Default to true for SSR
  });
  const [conversationToDelete, setConversationToDelete] = useState<
    number | null
  >(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [newConversationTitle, setNewConversationTitle] = useState("");
  const [showNewConversationDialog, setShowNewConversationDialog] =
    useState(false);

  // CSS classes for the sidebar based on visibility
  const sidebarClasses = showSidebar
    ? "w-1/4 min-w-[250px] border-r border-border h-[calc(100vh-12rem)] overflow-y-auto"
    : "hidden";

  // Fetch conversations for this video
  const {
    data: conversations,
    isLoading: isLoadingConversations,
    refetch: refetchConversations,
  } = useQuery({
    queryKey: ["/api/videos", videoId, "qa"],
    queryFn: async () => {
      // Use our improved fetchAPI helper with better response handling
      const anonymousSessionId = getOrCreateAnonymousSessionId();
      const headers: Record<string, string> = {};

      if (anonymousSessionId) {
        headers["x-anonymous-session"] = anonymousSessionId;
        console.log(
          "[QA Section] Using anonymous session ID for GET conversations:",
          anonymousSessionId,
        );
      }

      console.log(`[QA Section] Fetching conversations for video ${videoId}`);
      const data = await fetchAPI<QASession[]>(
        "GET",
        `/api/videos/${videoId}/qa`,
        undefined,
        headers,
      );
      
      console.log(`[QA Section] Fetched ${data?.length || 0} conversations for video ${videoId}:`, data);
      return data;
    },
    enabled: videoId > 0,
  });

  // Fetch active conversation if set
  const {
    data: conversationData,
    isLoading: isLoadingConversation,
    refetch: refetchConversation,
  } = useQuery({
    queryKey: ["/api/qa", activeConversation],
    queryFn: async () => {
      if (!activeConversation) return null;

      // Use our improved fetchAPI helper with better response handling
      const anonymousSessionId = getOrCreateAnonymousSessionId();
      const headers: Record<string, string> = {};

      if (anonymousSessionId) {
        headers["x-anonymous-session"] = anonymousSessionId;
        console.log(
          "[QA Section] Using anonymous session ID for GET conversation:",
          anonymousSessionId,
        );
      }

      console.log(`[QA Section] Fetching active conversation ${activeConversation}`);
      const data = await fetchAPI<any>(
        "GET",
        `/api/qa/${activeConversation}`,
        undefined,
        headers,
      );
      
      console.log(`[QA Section] Fetched conversation data for ID ${activeConversation}:`, data);
      return data;
    },
    enabled: activeConversation !== null,
  });

  // Create a new conversation
  const createConversation = useMutation({
    mutationFn: async (title: string) => {
      // Use apiRequest instead of axios to include anonymous session headers
      const anonymousSessionId = getOrCreateAnonymousSessionId();
      const headers: Record<string, string> = {};

      if (anonymousSessionId) {
        headers["x-anonymous-session"] = anonymousSessionId;
        console.log(
          "[QA Section] Using anonymous session ID:",
          anonymousSessionId,
        );
      }

      const response = await apiRequest(
        "POST",
        `/api/videos/${videoId}/qa`,
        {
          title,
        },
        headers,
      );

      const data = await response.json();
      return data;
    },
    onSuccess: (data) => {
      console.log("Conversation created:", data);

      if (
        data &&
        typeof data === "object" &&
        "id" in data &&
        typeof data.id === "number"
      ) {
        // Force refetching conversation list
        refetchConversations();

        // Set the active conversation
        setActiveConversation(data.id);

        // Clear messages array to start fresh
        setMessages([]);
      }
    },
    onError: (error) => {
      console.error("Failed to create conversation:", error);
      // Report error to user and reset submitting state
      setIsSubmitting(false);
      // Try to log more details about the error
      if (error instanceof Error) {
        console.error("Error details:", error.message, error.stack);
      }
    },
  });

  // Mutation for adding a new message to a conversation
  const addMessage = useMutation({
    mutationFn: async ({
      conversationId,
      content,
    }: {
      conversationId: number;
      content: string;
    }) => {
      // Use apiRequest instead of axios to include anonymous session headers
      const anonymousSessionId = getOrCreateAnonymousSessionId();
      const headers: Record<string, string> = {};

      if (anonymousSessionId) {
        headers["x-anonymous-session"] = anonymousSessionId;
        console.log(
          "[QA Section] Using anonymous session ID for adding message:",
          anonymousSessionId,
        );
      }

      const response = await apiRequest(
        "POST",
        `/api/qa/${conversationId}/ask`,
        {
          question: content,
          video_id: videoId,
        },
        headers,
      );

      const data = await response.json();
      return data;
    },
    onSuccess: (data) => {
      console.log("Message added, response:", data);

      // Update messages with the new AI response
      if (
        data &&
        data.conversation &&
        Array.isArray(data.conversation.messages)
      ) {
        setMessages(data.conversation.messages);
      }

      // Make sure we're not still in loading state
      setIsSubmitting(false);
    },
    onError: (error) => {
      console.error("Failed to send message:", error);
      setIsSubmitting(false);
    },
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
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Add window resize event listener to adjust sidebar visibility
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setShowSidebar(true); // Always show sidebar on desktop
      }
    };

    window.addEventListener("resize", handleResize);

    // Initial check
    handleResize();

    // Cleanup listener on component unmount
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const handleCreateNewConversation = async () => {
    try {
      // If user has entered a title in the dialog, use it; otherwise create one from the question
      let title = newConversationTitle.trim();
      if (!title) {
        title = `Q: ${question.substring(0, 25)}${question.length > 25 ? "..." : ""}`;
      }

      // Store the current question to use after conversation is created
      const initialQuestion = question;

      // Clear the question input field and conversation title immediately
      setQuestion("");
      setNewConversationTitle("");
      
      // Set submitting state to provide visual feedback
      setIsSubmitting(true);

      console.log("Creating new conversation with title:", title);
      
      // Get the anonymous session ID
      const anonymousSessionId = getOrCreateAnonymousSessionId();
      const headers: Record<string, string> = {};

      if (anonymousSessionId) {
        headers["x-anonymous-session"] = anonymousSessionId;
        console.log(
          "[QA CreateConv] Using anonymous session:",
          anonymousSessionId
        );
      }

      // Use improved fetchAPI helper to create the conversation
      console.log(`Making API request to create conversation: POST /api/videos/${videoId}/qa with title: ${title}`);
      
      const data = await fetchAPI<any>(
        "POST",
        `/api/videos/${videoId}/qa`,
        { title },
        headers
      );
      
      console.log("Conversation created successfully:", data);
      
      // After conversation is created successfully, force refetch conversations
      refetchConversations();
      
      if (data && typeof data === "object" && "id" in data && typeof data.id === "number") {
        // Set the active conversation
        setActiveConversation(data.id);
        
        // Only send the initial question if there's actual content
        if (initialQuestion.trim()) {
          try {
            // Send the initial question using improved fetchAPI helper
            console.log(`Sending initial question to conversation ${data.id}:`, initialQuestion);
            
            const messageData = await fetchAPI<any>(
              "POST",
              `/api/qa/${data.id}/ask`,
              {
                question: initialQuestion,
                video_id: videoId,
              },
              headers
            );
            
            console.log("Initial message sent, response:", messageData);
            
            // Update messages with the new AI response
            if (messageData && messageData.conversation && Array.isArray(messageData.conversation.messages)) {
              setMessages(messageData.conversation.messages);
            }
          } catch (messageError) {
            console.error("Error sending initial message:", messageError);
          }
        }
      } else {
        console.error("Invalid conversation data received:", data);
      }
    } catch (error) {
      console.error("Error in handleCreateNewConversation:", error);
    } finally {
      // Always reset the submitting state when done
      setIsSubmitting(false);
    }
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

    try {
      // Store question content before clearing
      const currentQuestion = question;

      // Add user message immediately to UI for better UX
      const userMessage: Message = { role: "user", content: currentQuestion };
      setMessages([...messages, userMessage]);

      // Clear the input immediately
      setQuestion("");

      // Set loading state
      setIsSubmitting(true);

      // Get the anonymous session ID for the request
      const anonymousSessionId = getOrCreateAnonymousSessionId();
      const headers: Record<string, string> = {};

      if (anonymousSessionId) {
        headers["x-anonymous-session"] = anonymousSessionId;
        console.log(
          "[QA SubmitQ] Using anonymous session:",
          anonymousSessionId
        );
      }

      // Send the question using our improved API helper
      console.log(`Sending question to conversation ${activeConversation}:`, currentQuestion);
      
      const data = await fetchAPI<any>(
        "POST",
        `/api/qa/${activeConversation}/ask`,
        {
          question: currentQuestion,
          video_id: videoId,
        },
        headers
      );
      
      console.log("Message added, response:", data);

      // Update messages with the new AI response
      if (data && data.conversation && Array.isArray(data.conversation.messages)) {
        setMessages(data.conversation.messages);
      }
    } catch (error) {
      console.error("Error sending question:", error);
      // Show error in UI if needed
    } finally {
      // Always reset submitting state
      setIsSubmitting(false);
    }
  };

  const handleNewConversation = () => {
    // Skip the dialog and directly start a new conversation
    startNewConversation();
  };

  const startNewConversation = () => {
    // Close the dialog (in case it's open from somewhere else)
    setShowNewConversationDialog(false);

    // Reset the conversation state
    setActiveConversation(null);
    setMessages([]);

    // On mobile, hide the sidebar
    if (window.innerWidth < 768) {
      setShowSidebar(false);
    }

    // Focus the question input
    setTimeout(() => {
      const questionInput = document.getElementById("new-question-input");
      if (questionInput) {
        questionInput.focus();
      }
    }, 100);
  };

  // Delete conversation function
  const deleteConversation = useMutation({
    mutationFn: async (id: number) => {
      // Use improved fetchAPI helper with better error handling
      const anonymousSessionId = getOrCreateAnonymousSessionId();
      const headers: Record<string, string> = {};

      if (anonymousSessionId) {
        headers["x-anonymous-session"] = anonymousSessionId;
        console.log(
          "[QA Section] Using anonymous session ID for delete conversation:",
          anonymousSessionId,
        );
      }

      console.log(`[QA Section] Deleting conversation ${id}`);
      
      // The fetchAPI will handle empty responses (204 No Content)
      await fetchAPI(
        "DELETE", 
        `/api/qa/${id}`, 
        undefined, 
        headers
      );
      
      console.log(`[QA Section] Successfully deleted conversation ${id}`);
      
      // Return an empty object as the mutation response
      return {};
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
    },
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
        <div
          className={`
          ${showSidebar ? "fixed inset-0 z-50 bg-background/80 backdrop-blur-sm md:hidden" : "hidden"}
          md:block md:relative md:inset-auto md:z-auto md:bg-transparent md:backdrop-filter-none
        `}
        >
          <div
            className={`
            w-64 h-full flex-shrink-0 bg-muted/20 rounded-lg p-3 overflow-hidden 
            fixed left-0 top-0 bottom-0 z-50 transition-transform 
            ${showSidebar ? "translate-x-0" : "-translate-x-full"} 
            md:relative md:translate-x-0 md:z-auto
          `}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-medium">Conversations</h3>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowSidebar(false)}
                  className="h-7 px-2 text-xs md:hidden"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNewConversation}
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
                        className={`px-2 py-1.5 text-sm rounded hover:bg-muted transition-colors ${
                          activeConversation === conversation.id
                            ? "bg-muted"
                            : ""
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <div
                            className="flex-grow cursor-pointer overflow-hidden mr-1"
                            onClick={() => {
                              handleSelectConversation(conversation.id);
                              if (window.innerWidth < 768)
                                setShowSidebar(false);
                            }}
                          >
                            <div className="truncate">{conversation.title}</div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {conversation.createdAt
                                ? new Date(
                                    conversation.createdAt,
                                  ).toLocaleString("en-US", {
                                    year: "numeric",
                                    month: "short",
                                    day: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })
                                : "No date available"}
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
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M3 6h18" />
                              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                            </svg>
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
                {activeConversation && conversationData ? (
                  <span className="text-sm font-medium">
                    {conversationData.title}
                  </span>
                ) : (
                  <span className="text-sm text-muted-foreground">
                    No active conversation
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                {activeConversation && conversationData && (
                  <>
                    <SearchDialog
                      videoId={videoId}
                      title="Search Conversation"
                      description="Find specific information or questions in this conversation"
                      initialSearchTerm={searchTerm}
                      onSearchTermChange={setSearchTerm}
                      trigger={
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex items-center gap-1"
                          onClick={() => setSearchTerm("")}
                        >
                          <Search className="h-4 w-4" />
                          <span className="hidden sm:inline">Search</span>
                        </Button>
                      }
                    />
                    <ExportButton
                      videoId={videoId}
                      qaConversationId={activeConversation}
                      videoTitle={conversationData.title}
                      small
                    />
                  </>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNewConversation}
                  className="mr-2"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">New Conversation</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowSidebar(!showSidebar)}
                >
                  {showSidebar ? (
                    <PanelLeftOpen className="h-4 w-4 mr-2" />
                  ) : (
                    <PanelLeftClose className="h-4 w-4 mr-2" />
                  )}
                  <span className="hidden sm:inline">
                    {showSidebar ? "Show Conversations" : "Hide Conversations"}
                  </span>
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
                          className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                        >
                          <div
                            className={`max-w-[80%] rounded-lg p-4 ${
                              message.role === "user"
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {searchTerm ? (
                              <div
                                className="whitespace-pre-wrap"
                                dangerouslySetInnerHTML={{
                                  __html: highlightText({
                                    text: message.content,
                                    searchTerm,
                                    showFullTextWithHighlights: true,
                                  }),
                                }}
                              />
                            ) : (
                              <div className="whitespace-pre-wrap">
                                {message.content}
                              </div>
                            )}

                            {/* Citation section */}
                            {message.role === "assistant" &&
                              message.citations &&
                              message.citations.length > 0 && (
                                <div className="mt-3 pt-2 border-t border-border">
                                  <div className="text-xs font-medium mb-1.5">
                                    Sources cited:
                                  </div>
                                  <div className="flex flex-col gap-2">
                                    {message.citations.map((citation, idx) => (
                                      <div
                                        key={idx}
                                        className="text-xs bg-background/50 p-2 rounded"
                                      >
                                        <div className="font-medium text-primary">
                                          {citation.content_type === "transcript"
                                            ? "Transcript"
                                            : citation.content_type === "summary"
                                            ? "Summary"
                                            : citation.content_type === "note"
                                            ? "Note"
                                            : citation.content_type}
                                          {citation.timestamp && (
                                            <span className="ml-1 font-normal">
                                              ({citation.timestamp})
                                            </span>
                                          )}
                                        </div>
                                        <div className="mt-0.5 text-muted-foreground">
                                          {citation.content.length > 150
                                            ? citation.content.substring(0, 150) +
                                              "..."
                                            : citation.content}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                          </div>
                        </div>
                      ))}
                      <div ref={messagesEndRef} />
                    </div>
                  </ScrollArea>

                  <form
                    onSubmit={handleSubmitQuestion}
                    className="mt-4 flex items-end"
                  >
                    <div className="flex-grow relative">
                      <Textarea
                        id="new-question-input"
                        placeholder="Ask a question about this video..."
                        value={question}
                        onChange={(e) => setQuestion(e.target.value)}
                        className="min-h-[80px] pr-10 resize-none"
                        disabled={isSubmitting}
                      />
                      <Button
                        type="submit"
                        size="icon"
                        className="absolute right-2 bottom-2"
                        disabled={!question.trim() || isSubmitting}
                      >
                        {isSubmitting ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </form>
                </div>
              )
            ) : (
              <div className="flex flex-col items-center justify-center h-full">
                <div className="text-center mb-8">
                  <h3 className="text-xl font-semibold mb-2">
                    Start a new conversation
                  </h3>
                  <p className="text-muted-foreground">
                    Ask questions about this video content and get detailed
                    answers.
                  </p>
                </div>
                <form
                  onSubmit={handleSubmitQuestion}
                  className="w-full max-w-lg"
                >
                  <div className="relative">
                    <Textarea
                      id="new-question-input"
                      placeholder="Ask a question about this video..."
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      className="min-h-[120px] pr-10 resize-none"
                      disabled={isSubmitting}
                    />
                    <Button
                      type="submit"
                      size="icon"
                      className="absolute right-2 bottom-2"
                      disabled={!question.trim() || isSubmitting}
                    >
                      {isSubmitting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <Dialog
        open={conversationToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setConversationToDelete(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Conversation</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this conversation? This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConversationToDelete(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConversation}
              className="bg-red-500 hover:bg-red-600"
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New conversation dialog */}
      <Dialog
        open={showNewConversationDialog}
        onOpenChange={setShowNewConversationDialog}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start a New Conversation</DialogTitle>
            <DialogDescription>
              Enter a title for your new conversation.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input
              placeholder="Conversation title (optional)"
              value={newConversationTitle}
              onChange={(e) => setNewConversationTitle(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowNewConversationDialog(false)}
            >
              Cancel
            </Button>
            <Button onClick={startNewConversation}>Start New</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}