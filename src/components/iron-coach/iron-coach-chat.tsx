'use client';

/**
 * Iron Coach Chat — Premium Theme-Aware AI Coach with Persistent Memory
 * 
 * A clean, mobile-first AI coaching chat with:
 * - Theme-aware styling (gymbro, gymgirl, light, dark)
 * - Animated flame particles rising from bottom
 * - PERSISTENT chat history - remembers all conversations
 * - AI that learns about the user over time
 * - Full access to user data (weight, age, goals, etc.)
 * - Swipe gestures for mobile
 * - Streaming responses
 * - Touch-optimized 48px targets
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, X, Sparkles, Zap, Dumbbell, Target, Utensils, Cpu, Crown, Loader2, Trash2, MoreVertical, CalendarDays, MessageSquare, RefreshCw, AlertTriangle, TrendingUp, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { sanitizeAIContent } from '@/lib/security-utils';
import { apiFetch, getApiUrl } from '@/lib/mobile-api';
import { useLocale } from '@/lib/i18n/locale-context';
import { routeIronCoachRequest } from '@/lib/iron-coach/hybrid/router';
import type { IronCoachModelSource, IronCoachStreamChunk } from '@/lib/iron-coach/hybrid/types';
import {
  cancelLocalModelDownload,
  getLocalModelState,
  pauseLocalModelDownload,
  resumeLocalModelDownload,
  startLocalModelDownload,
} from '@/lib/iron-coach/model-manager';
import { IronCoachNative } from '@/lib/iron-coach/native-runtime';
import dynamic from 'next/dynamic';

// Dynamically import planner to avoid SSR issues
const WeeklyPlanner = dynamic(() => import('./weekly-planner').then(m => ({ default: m.WeeklyPlanner })), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="w-6 h-6 animate-spin text-orange-400" />
    </div>
  ),
});

// Dynamically import weight progress tracker
const WeightProgressTracker = dynamic(() => import('./weight-progress-tracker').then(m => ({ default: m.WeightProgressTracker })), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="w-6 h-6 animate-spin text-orange-400" />
    </div>
  ),
});

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  source?: IronCoachModelSource;
  timestamp: Date;
}

interface IronCoachProps {
  className?: string;
}

// ═══════════════════════════════════════════════════════════════
// Quick Actions
// ═══════════════════════════════════════════════════════════════

const QUICK_ACTIONS = [
  { text: "How am I doing?", icon: Target },
  { text: "Help with my diet", icon: Utensils },
  { text: "Workout advice", icon: Dumbbell },
  { text: "I need motivation", icon: Zap },
];

// ═══════════════════════════════════════════════════════════════
// Professional Confirmation Modal
// ═══════════════════════════════════════════════════════════════

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
  isLoading?: boolean;
  theme: string;
}

function ConfirmModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title, 
  message, 
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
  isLoading = false,
  theme
}: ConfirmModalProps) {
  if (!isOpen) return null;

  const variantStyles = {
    danger: {
      icon: 'text-red-500 bg-red-500/10',
      button: 'bg-red-500 hover:bg-red-600 text-white',
      iconBg: theme === 'gymgirl' ? 'bg-red-50' : 'bg-red-500/10'
    },
    warning: {
      icon: 'text-amber-500 bg-amber-500/10',
      button: 'bg-amber-500 hover:bg-amber-600 text-white',
      iconBg: theme === 'gymgirl' ? 'bg-amber-50' : 'bg-amber-500/10'
    },
    info: {
      icon: 'text-blue-500 bg-blue-500/10',
      button: 'bg-blue-500 hover:bg-blue-600 text-white',
      iconBg: theme === 'gymgirl' ? 'bg-blue-50' : 'bg-blue-500/10'
    }
  };

  const styles = variantStyles[variant];

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
        onClick={onClose}
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
        
        {/* Modal */}
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "relative w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden",
            theme === 'gymgirl' ? 'bg-white' :
            theme === 'light' ? 'bg-white' :
            'bg-zinc-900 border border-zinc-800'
          )}
        >
          {/* Content */}
          <div className="p-6">
            {/* Icon */}
            <div className={cn(
              "w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4",
              styles.iconBg
            )}>
              {variant === 'danger' && <Trash2 className="w-7 h-7 text-red-500" />}
              {variant === 'warning' && <RefreshCw className="w-7 h-7 text-amber-500" />}
              {variant === 'info' && <AlertTriangle className="w-7 h-7 text-blue-500" />}
            </div>
            
            {/* Title */}
            <h3 className={cn(
              "text-lg font-bold text-center mb-2",
              theme === 'gymgirl' ? 'text-[#4A1A2C]' :
              theme === 'light' ? 'text-zinc-900' :
              'text-white'
            )}>
              {title}
            </h3>
            
            {/* Message */}
            <p className={cn(
              "text-sm text-center leading-relaxed",
              theme === 'gymgirl' ? 'text-[#4A1A2C]/70' :
              theme === 'light' ? 'text-zinc-500' :
              'text-zinc-400'
            )}>
              {message}
            </p>
          </div>
          
          {/* Actions */}
          <div className={cn(
            "flex gap-3 p-4 pt-0",
            theme === 'gymgirl' ? 'bg-pink-50/50' : ''
          )}>
            <button
              onClick={onClose}
              disabled={isLoading}
              className={cn(
                "flex-1 py-3 px-4 rounded-xl font-medium text-sm transition-all",
                theme === 'gymgirl' ? 'bg-white border border-pink-200 text-[#4A1A2C] hover:bg-pink-50' :
                theme === 'light' ? 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200' :
                'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              )}
            >
              {cancelText}
            </button>
            <button
              onClick={onConfirm}
              disabled={isLoading}
              className={cn(
                "flex-1 py-3 px-4 rounded-xl font-medium text-sm transition-all flex items-center justify-center gap-2",
                styles.button,
                isLoading && 'opacity-70 cursor-not-allowed'
              )}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                confirmText
              )}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}

// ═══════════════════════════════════════════════════════════════
// Subtle Sparkle Ambient Effect
// ═══════════════════════════════════════════════════════════════

function SubtleSparkles({ theme }: { theme: string }) {
  const sparkles = useMemo(() => {
    return Array.from({ length: 8 }, (_, i) => ({
      id: i,
      left: `${10 + Math.random() * 80}%`,
      top: `${5 + Math.random() * 90}%`,
      delay: Math.random() * 6,
      duration: 2 + Math.random() * 3,
      size: 2 + Math.random() * 3,
    }));
  }, []);

  const color = theme === 'gymbro' ? 'text-red-400/60' : theme === 'gymgirl' ? 'text-pink-400/60' : theme === 'light' ? 'text-orange-400/40' : 'text-orange-400/50';

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {sparkles.map((s) => (
        <motion.div
          key={s.id}
          className={cn("absolute", color)}
          style={{ left: s.left, top: s.top, width: s.size, height: s.size }}
          animate={{ opacity: [0, 0.6, 0], scale: [0.5, 1, 0.5] }}
          transition={{ duration: s.duration, delay: s.delay, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Sparkles className="w-full h-full" />
        </motion.div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Theme Detection Hook
// ═══════════════════════════════════════════════════════════════

function useCurrentTheme() {
  const [theme, setTheme] = useState('dark');
  const initialRef = useRef(false);

  useEffect(() => {
    const detectTheme = () => {
      const html = document.documentElement;
      if (html.classList.contains('gymbro')) return 'gymbro';
      if (html.classList.contains('gymgirl')) return 'gymgirl';
      if (html.classList.contains('light') || html.classList.contains('white')) return 'light';
      if (html.classList.contains('dark')) return 'dark';
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    };

    if (!initialRef.current) {
      initialRef.current = true;
      queueMicrotask(() => setTheme(detectTheme()));
    }

    const observer = new MutationObserver(() => setTheme(detectTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return theme;
}

// ═══════════════════════════════════════════════════════════════
// Theme-Aware Styles
// ═══════════════════════════════════════════════════════════════

function getThemeStyles(theme: string) {
  switch (theme) {
    case 'gymbro':
      return {
        container: 'bg-[#050607]',
        header: 'border-red-900/50',
        headerBg: 'bg-gradient-to-r from-[#0A0C0E] to-[#080A0C]',
        avatar: 'bg-gradient-to-br from-red-500 to-red-700',
        avatarGlow: 'shadow-lg shadow-red-500/30',
        title: 'text-white',
        subtitle: 'text-red-300/70',
        closeButton: 'bg-[#121517] text-zinc-400 hover:text-red-400',
        input: 'bg-[#0A0C0E] border-red-900/30 text-white placeholder:text-zinc-500 focus:ring-red-500/30',
        sendButton: 'bg-gradient-to-r from-red-500 to-red-600 shadow-lg shadow-red-500/30',
        sendButtonDisabled: 'bg-[#121517] text-zinc-500',
        userBubble: 'bg-gradient-to-r from-red-500 to-red-600 text-white',
        assistantBubble: 'bg-[#0A0C0E] border border-red-900/30 text-zinc-100',
        quickAction: 'bg-[#0A0C0E] border-red-900/30 text-zinc-300',
        quickActionIcon: 'text-red-400',
        typingDot: 'bg-red-400',
        sourceCloud: 'bg-red-400',
        sourceLocal: 'bg-green-400',
        border: 'border-red-900/30',
        accent: 'red',
      };
    case 'gymgirl':
      return {
        container: 'bg-[#FFE4EE]',
        header: 'border-pink-200',
        headerBg: 'bg-gradient-to-r from-[#FFE8F0] to-[#FFD6E8]',
        avatar: 'bg-gradient-to-br from-pink-400 to-pink-600',
        avatarGlow: 'shadow-lg shadow-pink-400/30',
        title: 'text-[#4A1A2C]',
        subtitle: 'text-pink-400',
        closeButton: 'bg-white/50 text-[#4A1A2C] hover:text-pink-500',
        input: 'bg-white/80 border-pink-200 text-[#4A1A2C] placeholder:text-pink-300 focus:ring-pink-400/30',
        sendButton: 'bg-gradient-to-r from-pink-400 to-pink-500 shadow-lg shadow-pink-400/30',
        sendButtonDisabled: 'bg-pink-100 text-pink-300',
        userBubble: 'bg-gradient-to-r from-pink-400 to-pink-500 text-white',
        assistantBubble: 'bg-white/90 border border-pink-100 text-[#4A1A2C]',
        quickAction: 'bg-white/80 border-pink-200 text-[#4A1A2C]',
        quickActionIcon: 'text-pink-500',
        typingDot: 'bg-pink-400',
        sourceCloud: 'bg-pink-400',
        sourceLocal: 'bg-green-400',
        border: 'border-pink-200',
        accent: 'pink',
      };
    case 'light':
      return {
        container: 'bg-white',
        header: 'border-zinc-200',
        headerBg: 'bg-white',
        avatar: 'bg-gradient-to-br from-orange-400 to-orange-600',
        avatarGlow: 'shadow-lg shadow-orange-400/30',
        title: 'text-zinc-900',
        subtitle: 'text-zinc-500',
        closeButton: 'bg-zinc-100 text-zinc-500 hover:text-zinc-700',
        input: 'bg-zinc-100 border-zinc-200 text-zinc-900 placeholder:text-zinc-400 focus:ring-orange-400/30',
        sendButton: 'bg-gradient-to-r from-orange-400 to-orange-500 shadow-lg shadow-orange-400/30',
        sendButtonDisabled: 'bg-zinc-100 text-zinc-400',
        userBubble: 'bg-gradient-to-r from-orange-400 to-orange-500 text-white',
        assistantBubble: 'bg-zinc-100 border border-zinc-200 text-zinc-900',
        quickAction: 'bg-zinc-100 border-zinc-200 text-zinc-700',
        quickActionIcon: 'text-orange-500',
        typingDot: 'bg-orange-400',
        sourceCloud: 'bg-blue-400',
        sourceLocal: 'bg-green-500',
        border: 'border-zinc-200',
        accent: 'orange',
      };
    default:
      return {
        container: 'bg-zinc-900',
        header: 'border-zinc-800',
        headerBg: 'bg-zinc-900',
        avatar: 'bg-gradient-to-br from-orange-500 to-red-600',
        avatarGlow: 'shadow-lg shadow-orange-500/30',
        title: 'text-white',
        subtitle: 'text-zinc-400',
        closeButton: 'bg-zinc-800 text-zinc-400 hover:text-white',
        input: 'bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 focus:ring-orange-500/30',
        sendButton: 'bg-gradient-to-r from-orange-500 to-red-500 shadow-lg shadow-orange-500/30',
        sendButtonDisabled: 'bg-zinc-800 text-zinc-500',
        userBubble: 'bg-gradient-to-r from-orange-500 to-red-500 text-white',
        assistantBubble: 'bg-zinc-800 border border-zinc-700 text-zinc-100',
        quickAction: 'bg-zinc-800 border-zinc-700 text-zinc-300',
        quickActionIcon: 'text-orange-400',
        typingDot: 'bg-orange-400',
        sourceCloud: 'bg-blue-400',
        sourceLocal: 'bg-green-400',
        border: 'border-zinc-800',
        accent: 'orange',
      };
  }
}

// ═══════════════════════════════════════════════════════════════
// Markdown Renderer
// ═══════════════════════════════════════════════════════════════

function renderContent(text: string, accent: string): React.ReactNode {
  const sanitized = sanitizeAIContent(text, 8000);
  const lines = sanitized.split('\n');
  
  const accentColor = accent === 'red' ? 'text-red-400' : accent === 'pink' ? 'text-pink-400' : 'text-orange-400';
  
  return lines.map((line, i) => {
    if (/^\s*[-•]\s/.test(line)) {
      return (
        <div key={i} className="flex gap-2 mb-1">
          <span className={cn("mt-0.5", accentColor)}>•</span>
          <span>{formatInline(line.replace(/^\s*[-•]\s/, ''), accent)}</span>
        </div>
      );
    }
    if (/^\s*\d+[.)]\s/.test(line)) {
      const num = line.match(/^\s*(\d+)/)?.[1];
      return (
        <div key={i} className="flex gap-2 mb-1">
          <span className={cn("font-bold w-5", accentColor)}>{num}.</span>
          <span>{formatInline(line.replace(/^\s*\d+[.)]\s/, ''), accent)}</span>
        </div>
      );
    }
    if (!line.trim()) return <div key={i} className="h-2" />;
    return <p key={i} className={cn("mb-1", i > 0 && "mt-1")}>{formatInline(line, accent)}</p>;
  });
}

function formatInline(text: string, accent: string): React.ReactNode {
  const accentBold = accent === 'red' ? 'text-red-300' : accent === 'pink' ? 'text-pink-300' : 'text-orange-300';
  const accentCode = accent === 'red' ? 'text-red-300 bg-red-900/30' : accent === 'pink' ? 'text-pink-300 bg-pink-100/50' : 'text-orange-300 bg-orange-900/30';
  
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    if (match[2]) parts.push(<strong key={key++} className={cn("font-semibold", accentBold)}>{match[2]}</strong>);
    else if (match[3]) parts.push(<em key={key++} className="opacity-80">{match[3]}</em>);
    else if (match[4]) parts.push(<code key={key++} className={cn("px-1.5 py-0.5 rounded text-sm font-mono", accentCode)}>{match[4]}</code>);
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.length > 0 ? <>{parts}</> : text;
}

// ═══════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════

export function IronCoach({ className }: IronCoachProps) {
  const theme = useCurrentTheme();
  const styles = useMemo(() => getThemeStyles(theme), [theme]);
  const { t, locale } = useLocale();
  
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'progress' | 'planner' | 'chat'>('progress');
  const [showFeatureHint, setShowFeatureHint] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [aiConversationId, setAiConversationId] = useState<string | null>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  
  // Model download state
  const [localModelReady, setLocalModelReady] = useState(false);
  const [localModelSupported, setLocalModelSupported] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  
  // Menu state
  const [showMenu, setShowMenu] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 });
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmModalType, setConfirmModalType] = useState<'clear' | 'update'>('clear');
  const menuButtonRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const plannerRef = useRef<{ regeneratePlan: () => void } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, scrollToBottom]);

  // Load chat history when opening - non-blocking
  useEffect(() => {
    // Don't load if not open or already loaded in this session
    if (!isOpen || historyLoaded) return;
    
    // Load history in background (don't block UI)
    const loadHistory = async () => {
      setIsLoadingHistory(true);
      try {
        const response = await apiFetch('/api/iron-coach/history');
        if (response.ok) {
          const data = await response.json();
          
          if (data.conversation?.id) {
            setAiConversationId(data.conversation.id);
          }
          
          if (data.messages?.length > 0) {
            // We have history - load it
            const loadedMessages: Message[] = data.messages.map((msg: any) => ({
              id: msg.id || `loaded-${Date.now()}-${Math.random()}`,
              role: msg.role,
              content: msg.content,
              source: msg.source,
              timestamp: new Date(msg.timestamp || Date.now()),
            }));
            setMessages(loadedMessages);
          } else {
            // No history - show welcome message
            setMessages([{
              id: 'welcome',
              role: 'assistant',
              content: "I'm **The Iron Coach** 💀 — your no-nonsense nutrition and fitness weapon. I don't coddle, I FORGE.\n\nI have access to your profile, food logs, workouts, and goals. Ask me about:\n• **Nutrition** — calories, macros, meal plans\n• **Training** — workouts, progress, gains\n• **Your body** — weight trends, composition\n\nStop wasting time. What do you want to fix? ⚡",
              timestamp: new Date()
            }]);
          }
        }
      } catch (error) {
        console.error('Failed to load chat history:', error);
        // Show welcome message on error
        setMessages([{
          id: 'welcome',
          role: 'assistant',
          content: "I'm **The Iron Coach** 💀 — your no-nonsense nutrition and fitness weapon. Ask me about your nutrition, workouts, or body composition. What do you want to fix? ⚡",
          timestamp: new Date()
        }]);
      } finally {
        setIsLoadingHistory(false);
        setHistoryLoaded(true);
      }
    };

    loadHistory();
  }, [isOpen, historyLoaded]);

  // Focus input on open
  useEffect(() => {
    if (isOpen && !isLoadingHistory) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [isOpen, isLoadingHistory]);

  // Check local model support
  useEffect(() => {
    if (!isOpen) return;
    getLocalModelState()
      .then((state) => {
        setLocalModelSupported(!!state.supported);
        setLocalModelReady(!!state.ready);
      })
      .catch(() => {
        setLocalModelSupported(false);
        setLocalModelReady(false);
      });
  }, [isOpen]);

  // Model download progress listener
  useEffect(() => {
    if (!isOpen || localModelReady) return;
    let mounted = true;
    let handle: { remove: () => Promise<void> } | null = null;

    IronCoachNative.addListener('modelDownloadProgress', (event) => {
      if (!mounted) return;
      setDownloadProgress(Math.min(100, Math.max(0, Math.round(event.progress * 100))));
    }).then((h) => { handle = h; }).catch(() => {});

    return () => {
      mounted = false;
      handle?.remove();
    };
  }, [isOpen, localModelReady]);

  // Model download handlers
  const handleStartDownload = useCallback(async () => {
    try {
      setModelError(null);
      setIsDownloading(true);
      setIsPaused(false);
      await startLocalModelDownload({
        downloadUrl: process.env.NEXT_PUBLIC_IRON_MODEL_URL || '',
        checksumSha256: process.env.NEXT_PUBLIC_IRON_MODEL_SHA256 || '',
      });
      const state = await getLocalModelState();
      setLocalModelReady(!!state.ready);
    } catch (err) {
      setModelError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setIsDownloading(false);
    }
  }, []);

  const handlePauseResume = useCallback(async () => {
    try {
      if (isPaused) {
        await resumeLocalModelDownload();
        setIsPaused(false);
      } else {
        await pauseLocalModelDownload();
        setIsPaused(true);
      }
    } catch (err) {
      setModelError(err instanceof Error ? err.message : 'Failed');
    }
  }, [isPaused]);

  const handleCancelDownload = useCallback(async () => {
    try {
      await cancelLocalModelDownload();
      setIsDownloading(false);
      setIsPaused(false);
      setDownloadProgress(0);
    } catch (err) {
      setModelError(err instanceof Error ? err.message : 'Failed');
    }
  }, []);

  // Request clear chat - shows modal
  const requestClearChat = useCallback(() => {
    setShowMenu(false);
    setConfirmModalType('clear');
    setShowConfirmModal(true);
  }, []);

  // Request update plan - shows modal
  const requestUpdatePlan = useCallback(() => {
    setShowMenu(false);
    setConfirmModalType('update');
    setShowConfirmModal(true);
  }, []);

  // Clear chat history - actual execution
  const handleClearChat = useCallback(async () => {
    setIsClearing(true);
    console.log('[IronCoach] Clearing chat history...');
    
    try {
      const response = await apiFetch('/api/iron-coach/clear', { 
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      });
      
      console.log('[IronCoach] Clear response status:', response.status);
      
      const data = await response.json();
      console.log('[IronCoach] Clear response:', data);
      
      // Check both HTTP status and response success flag
      if (response.ok && data.success !== false) {
        // Reset all state
        setMessages([{
          id: 'welcome-cleared',
          role: 'assistant',
          content: "**WIPED CLEAN.** 💀\n\nFresh start, no excuses. What are we fixing today? Nutrition? Training? Body composition?\n\nStop wasting time and TELL ME what you want! ⚡",
          timestamp: new Date()
        }]);
        setAiConversationId(null);
        setSessionId(null);
        // Keep historyLoaded true so we don't re-fetch
      } else {
        // Partial success or failure
        console.error('[IronCoach] Clear failed:', data);
        if (data.deleted && (data.deleted.aiMessages > 0 || data.deleted.aiConversations > 0)) {
          // Partial success - some data was deleted
          setMessages([{
            id: 'welcome-partial',
            role: 'assistant',
            content: "**Mostly wiped.** 💀\n\nSome data may remain. Refresh the app to see current state.\n\nWhat do you want to work on? ⚡",
            timestamp: new Date()
          }]);
          setAiConversationId(null);
          setSessionId(null);
        }
      }
    } catch (err) {
      console.error('[IronCoach] Clear error:', err);
    } finally {
      setIsClearing(false);
      setShowConfirmModal(false);
    }
  }, []);

  // Update plan - actual execution
  const handleUpdatePlan = useCallback(async () => {
    setIsClearing(true);
    console.log('[IronCoach] Updating weekly plan...');
    
    try {
      const response = await apiFetch('/api/iron-coach/weekly-planner', {
        method: 'POST',
        body: JSON.stringify({ force_regenerate: true }),
      });

      if (!response.ok) throw new Error('Failed to generate plan');

      const data = await response.json();
      
      if (data.success && data.plan) {
        console.log('[IronCoach] Plan updated successfully');
        // The WeeklyPlanner component will refetch automatically
      } else {
        throw new Error(data.message || 'Failed to generate plan');
      }
    } catch (err) {
      console.error('[IronCoach] Update plan error:', err);
    } finally {
      setIsClearing(false);
      setShowConfirmModal(false);
    }
  }, []);

  // Handle modal confirm based on type
  const handleModalConfirm = useCallback(() => {
    if (confirmModalType === 'clear') {
      handleClearChat();
    } else {
      handleUpdatePlan();
    }
  }, [confirmModalType, handleClearChat, handleUpdatePlan]);

  // Close menu when clicking outside and update position
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      // Check if click is inside either the menu button OR the dropdown
      const target = e.target as Node;
      const isInsideButton = menuButtonRef.current?.contains(target);
      const isInsideDropdown = dropdownRef.current?.contains(target);
      
      if (!isInsideButton && !isInsideDropdown) {
        setShowMenu(false);
      }
    };
    
    // Update position when menu opens
    if (showMenu && menuButtonRef.current) {
      const rect = menuButtonRef.current.getBoundingClientRect();
      setMenuPosition({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      });
    }
    
    if (showMenu) {
      // Use pointerdown instead of mousedown for better mobile support
      document.addEventListener('pointerdown', handleClickOutside);
    }
    return () => document.removeEventListener('pointerdown', handleClickOutside);
  }, [showMenu]);

  // Update assistant message during streaming
  const updateAssistantMessage = useCallback((id: string, content: string, source?: IronCoachModelSource) => {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, content, source: source || m.source } : m));
  }, []);

  // Send message
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    const assistantId = `assistant-${Date.now()}`;
    setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '', timestamp: new Date() }]);

    const controller = new AbortController();
    setAbortController(controller);

    try {
      const decision = routeIronCoachRequest({
        question: text,
        isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
        device: { supportsLocalInference: localModelSupported, modelReady: localModelReady },
      });

      if (decision.source === 'local_model') {
        const inference = await IronCoachNative.infer({
          prompt: `User: ${text}\nRespond as Iron Coach - a warm, supportive, and knowledgeable fitness friend who genuinely cares about the user's success.`,
          maxTokens: 500,
          temperature: 0.4,
          requestId: `local-${Date.now()}`,
        });

        const fullText = inference.text || '';
        let built = '';
        
        for (const chunk of fullText.split(/(\s+)/)) {
          if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
          built += chunk;
          updateAssistantMessage(assistantId, built, 'local_model');
          await new Promise(r => setTimeout(r, 15));
        }
      } else {
        console.log('[IronCoach] Sending request to /api/iron-coach/chat/stream');
        const response = await apiFetch('/api/iron-coach/chat/stream', {
          method: 'POST',
          body: JSON.stringify({
            message: text,
            sessionId,
            aiConversationId,
            localModelReady,
            supportsLocalInference: localModelSupported,
            isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
            locale,
          }),
          signal: controller.signal,
        });

        console.log('[IronCoach] Response status:', response.status);
        if (!response.ok) {
          const errorText = await response.text();
          console.error('[IronCoach] Response not OK:', response.status, errorText);
          throw new Error(`Request failed: ${response.status} - ${errorText}`);
        }
        if (!response.body) {
          console.error('[IronCoach] No response body');
          throw new Error('No response body');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullText = '';
        let receivedAnyData = false;

        while (true) {
          const { done, value } = await reader.read();
          console.log('[IronCoach] Read chunk, done:', done, 'value length:', value?.length || 0);
          
          if (done) {
            console.log('[IronCoach] Stream done, fullText length:', fullText.length);
            break;
          }
          
          receivedAnyData = true;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const chunk: IronCoachStreamChunk = JSON.parse(line);
              console.log('[IronCoach] Received chunk:', chunk.type, chunk.token?.slice(0, 20));
              if (chunk.type === 'meta' && chunk.aiConversationId) setAiConversationId(chunk.aiConversationId);
              if (chunk.type === 'token' && chunk.token) {
                fullText += chunk.token;
                updateAssistantMessage(assistantId, fullText, 'cloud_model');
              }
              if (chunk.type === 'error') {
                console.error('[IronCoach] Stream error:', chunk.error);
                throw new Error(chunk.error || 'Streaming error');
              }
            } catch (parseErr) {
              console.error('[IronCoach] Parse error for line:', line, parseErr);
            }
          }
        }

        console.log('[IronCoach] Stream complete. receivedAnyData:', receivedAnyData, 'fullText length:', fullText.length);
      }
    } catch (err) {
      const isAbort = err instanceof DOMException && err.name === 'AbortError';
      updateAssistantMessage(assistantId, isAbort ? 'Cancelled.' : "Connection issue. Try again.", 'cloud_model');
    } finally {
      setAbortController(null);
      setIsLoading(false);
    }
  }, [isLoading, sessionId, aiConversationId, localModelReady, localModelSupported, updateAssistantMessage, locale]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  }, [input, sendMessage]);

  const handleCancel = useCallback(() => {
    abortController?.abort();
    setIsLoading(false);
  }, [abortController]);

  // Swipe-to-dismiss via custom touch handler (avoids passive listener warning)
  const panelRef = useRef<HTMLDivElement>(null);
  const dragState = useRef({ startY: 0, currentY: 0, isDragging: false });

  const handleTouchStart = useCallback((e: TouchEvent) => {
    // Only capture if touch starts near the top 60px (pull indicator area) or at very top of scroll
    const target = e.target as HTMLElement;
    const scrollableParent = target.closest('.overflow-y-auto');
    if (scrollableParent && scrollableParent.scrollTop > 5) return;
    dragState.current.startY = e.touches[0].clientY;
    dragState.current.currentY = e.touches[0].clientY;
    dragState.current.isDragging = true;
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!dragState.current.isDragging) return;
    dragState.current.currentY = e.touches[0].clientY;
    const deltaY = dragState.current.currentY - dragState.current.startY;
    if (deltaY > 0) {
      e.preventDefault(); // Only prevent default when dragging down — now safe (non-passive)
      const panel = panelRef.current;
      if (panel) {
        const clampedY = Math.min(deltaY * 0.5, window.innerHeight * 0.4);
        panel.style.transform = `translateY(${clampedY}px)`;
        panel.style.transition = 'none';
      }
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!dragState.current.isDragging) return;
    dragState.current.isDragging = false;
    const deltaY = dragState.current.currentY - dragState.current.startY;
    const velocity = deltaY > 0 ? deltaY : 0; // simplified velocity from distance
    const panel = panelRef.current;
    if (panel) {
      panel.style.transition = 'transform 0.3s cubic-bezier(0.25, 0.1, 0.25, 1)';
      if (deltaY > 100) {
        panel.style.transform = 'translateY(100%)';
        setTimeout(() => {
          panel.style.transform = '';
          panel.style.transition = '';
          setIsOpen(false);
          setHistoryLoaded(false);
        }, 300);
      } else {
        panel.style.transform = 'translateY(0)';
        setTimeout(() => {
          panel.style.transform = '';
          panel.style.transition = '';
        }, 300);
      }
    }
  }, []);

  // Register non-passive touch listeners on the panel to allow preventDefault
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    panel.addEventListener('touchstart', handleTouchStart, { passive: true });
    panel.addEventListener('touchmove', handleTouchMove, { passive: false });
    panel.addEventListener('touchend', handleTouchEnd, { passive: true });
    return () => {
      panel.removeEventListener('touchstart', handleTouchStart);
      panel.removeEventListener('touchmove', handleTouchMove);
      panel.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  return (
    <>
      {/* Floating Action Button */}
      <motion.button
        onClick={() => {
          setIsOpen(true);
          // Show feature hint on first open
          if (typeof window !== 'undefined' && !localStorage.getItem('ic_hint_dismissed')) {
            setTimeout(() => setShowFeatureHint(true), 400);
          }
        }}
        className={cn("fixed bottom-20 right-4 z-40 w-14 h-14 rounded-full flex items-center justify-center", styles.avatar, styles.avatarGlow, isOpen && "hidden", className)}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        aria-label="Open Iron Coach"
      >
        <Sparkles className="w-6 h-6 text-white" />
        {/* Subtle indicator dot */}
        <div className={cn("absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2",
          theme === 'gymbro' ? 'bg-red-500 border-[#050607]' : theme === 'gymgirl' ? 'bg-pink-500 border-[#FFE4EE]' : theme === 'light' ? 'bg-orange-500 border-white' : 'bg-orange-500 border-zinc-900'
        )} />
      </motion.button>

      {/* Chat Panel - Portal to body to prevent z-index issues */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {isOpen && (
            <motion.div
              key="chat-panel"
              initial={{ y: '100%', opacity: 1 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 1 }}
              transition={{ type: 'spring', damping: 30, stiffness: 400 }}
              ref={panelRef}
              className={cn("fixed inset-0 z-[100] flex flex-col touch-pan-x overflow-hidden", styles.container)}
            >
              <SubtleSparkles theme={theme} />

            {/* Pull indicator */}
            <div className="flex justify-center pt-2 pb-1 md:hidden relative z-10">
              <div className={cn("w-10 h-1 rounded-full", theme === 'gymgirl' ? 'bg-pink-300/50' : 'bg-zinc-700')} />
            </div>

            {/* Header */}
            <header className={cn("relative z-10 flex items-center gap-3 px-4 py-3 border-b", styles.header, styles.headerBg)}>
              <div className="relative">
                <div className={cn("w-11 h-11 rounded-full flex items-center justify-center", styles.avatar, styles.avatarGlow)}>
                  <Sparkles className="w-6 h-6 text-white" />
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-500 border-2 border-transparent"
                  style={{ borderColor: theme === 'gymgirl' ? '#FFE8F0' : theme === 'light' ? '#fff' : '#18181b' }}
                />
              </div>
              
              <div className="flex-1">
                <h1 className={cn("font-bold text-lg", styles.title)}>Iron Coach</h1>
                <div className="flex items-center gap-1">
                  <Crown className={cn("w-3 h-3", theme === 'gymbro' ? 'text-amber-400' : theme === 'gymgirl' ? 'text-pink-400' : 'text-orange-400')} />
                  <span className={cn("text-xs", styles.subtitle)}>{t('coach.fitnessFriend')} • {t('coach.remembersEverything')}</span>
                </div>
              </div>

              {/* Menu button */}
              <div ref={menuButtonRef} className="relative">
                <button 
                  onClick={() => setShowMenu(!showMenu)} 
                  className={cn("w-10 h-10 rounded-full flex items-center justify-center active:scale-95 transition-all", styles.closeButton)} 
                  aria-label="Menu"
                >
                  <MoreVertical className="w-5 h-5" />
                </button>
                
                {/* Dropdown menu - Portal to body to escape stacking context */}
                {showMenu && typeof document !== 'undefined' && createPortal(
                  <motion.div
                    ref={dropdownRef}
                    initial={{ opacity: 0, scale: 0.95, y: -10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -10 }}
                    className={cn("fixed w-48 rounded-xl border shadow-lg overflow-hidden z-[9999]",
                      theme === 'gymgirl' ? 'bg-white border-pink-200' : 
                      theme === 'light' ? 'bg-white border-zinc-200' : 
                      'bg-zinc-900 border-zinc-700'
                    )}
                    style={{
                      top: menuPosition.top,
                      right: menuPosition.right,
                    }}
                  >
                    {activeTab === 'chat' ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          requestClearChat();
                        }}
                        disabled={isClearing}
                        className={cn(
                          "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors",
                          theme === 'gymgirl' ? 'hover:bg-pink-50 text-[#4A1A2C]' :
                          theme === 'light' ? 'hover:bg-zinc-50 text-zinc-900' :
                          'hover:bg-zinc-800 text-zinc-100'
                        )}
                      >
                        <Trash2 className="w-4 h-4 text-red-400" />
                        <span>{isClearing && confirmModalType === 'clear' ? 'Clearing...' : 'Clear Chat History'}</span>
                      </button>
                    ) : activeTab === 'planner' ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          requestUpdatePlan();
                        }}
                        disabled={isClearing}
                        className={cn(
                          "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors",
                          theme === 'gymgirl' ? 'hover:bg-pink-50 text-[#4A1A2C]' :
                          theme === 'light' ? 'hover:bg-zinc-50 text-zinc-900' :
                          'hover:bg-zinc-800 text-zinc-100'
                        )}
                      >
                        <RefreshCw className={cn("w-4 h-4 text-amber-500", isClearing && confirmModalType === 'update' && "animate-spin")} />
                        <span>{isClearing && confirmModalType === 'update' ? 'Updating...' : 'Update Plan'}</span>
                      </button>
                    ) : null}
                  </motion.div>,
                  document.body
                )}
              </div>

              <button onClick={() => {
                setIsOpen(false);
                // Reset historyLoaded so next open will fetch fresh history
                setHistoryLoaded(false);
              }} className={cn("w-10 h-10 rounded-full flex items-center justify-center active:scale-95 transition-all", styles.closeButton)} aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </header>

            {/* Feature Hint — one-time onboarding tooltip */}
            <AnimatePresence>
              {showFeatureHint && (
                <motion.div
                  initial={{ opacity: 0, y: -10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.95 }}
                  transition={{ duration: 0.3 }}
                  className={cn(
                    "mx-4 mt-2 rounded-xl px-3 py-2.5 flex items-center gap-2 relative overflow-hidden",
                    theme === 'gymbro' ? 'bg-red-500/10 border border-red-500/20' :
                    theme === 'gymgirl' ? 'bg-pink-500/10 border border-pink-300/20' :
                    theme === 'light' ? 'bg-orange-50 border border-orange-200' :
                    'bg-orange-500/10 border border-orange-500/20'
                  )}
                >
                  <div className="flex items-center gap-1.5 flex-1">
                    {[{ icon: TrendingUp, label: 'Progress' }, { icon: CalendarDays, label: 'Planner' }, { icon: MessageSquare, label: 'Chat' }].map((item, i) => (
                      <React.Fragment key={item.label}>
                        <div className={cn(
                          "flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold",
                          theme === 'gymbro' ? 'bg-red-500/15 text-red-300' :
                          theme === 'gymgirl' ? 'bg-pink-400/15 text-pink-600' :
                          theme === 'light' ? 'bg-orange-100 text-orange-600' :
                          'bg-orange-500/15 text-orange-300'
                        )}>
                          <item.icon className="w-3 h-3" />
                          {item.label}
                        </div>
                        {i < 2 && <ChevronUp className="w-2.5 h-2.5 rotate-90 opacity-30" />}
                      </React.Fragment>
                    ))}
                  </div>
                  <button onClick={() => { setShowFeatureHint(false); try { localStorage.setItem('ic_hint_dismissed', '1'); } catch {} }} className="opacity-40 hover:opacity-70 transition-opacity">
                    <X className="w-3 h-3" />
                  </button>
                  {/* Auto-dismiss shimmer bar */}
                  <motion.div
                    className={cn("absolute bottom-0 left-0 h-0.5",
                      theme === 'gymbro' ? 'bg-red-400' : theme === 'gymgirl' ? 'bg-pink-400' : 'bg-orange-400'
                    )}
                    initial={{ width: '100%' }}
                    animate={{ width: '0%' }}
                    transition={{ duration: 4, ease: 'linear' }}
                    onAnimationComplete={() => { setShowFeatureHint(false); try { localStorage.setItem('ic_hint_dismissed', '1'); } catch {} }}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Tab Bar */}
            <div className={cn("relative z-10 flex border-b", styles.border)}>
              <button
                onClick={() => setActiveTab('progress')}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-all",
                  activeTab === 'progress' 
                    ? cn(styles.accent === 'red' ? 'text-red-400 border-b-2 border-red-400' : 
                         styles.accent === 'pink' ? 'text-pink-400 border-b-2 border-pink-400' : 
                         'text-orange-400 border-b-2 border-orange-400')
                    : cn(styles.subtitle, "hover:opacity-80")
                )}
              >
                <TrendingUp className="w-4 h-4" />
                Progress
              </button>
              <button
                onClick={() => setActiveTab('planner')}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-all",
                  activeTab === 'planner' 
                    ? cn(styles.accent === 'red' ? 'text-red-400 border-b-2 border-red-400' : 
                         styles.accent === 'pink' ? 'text-pink-400 border-b-2 border-pink-400' : 
                         'text-orange-400 border-b-2 border-orange-400')
                    : cn(styles.subtitle, "hover:opacity-80")
                )}
              >
                <CalendarDays className="w-4 h-4" />
                Planner
              </button>
              <button
                onClick={() => setActiveTab('chat')}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-all",
                  activeTab === 'chat' 
                    ? cn(styles.accent === 'red' ? 'text-red-400 border-b-2 border-red-400' : 
                         styles.accent === 'pink' ? 'text-pink-400 border-b-2 border-pink-400' : 
                         'text-orange-400 border-b-2 border-orange-400')
                    : cn(styles.subtitle, "hover:opacity-80")
                )}
              >
                <MessageSquare className="w-4 h-4" />
                Chat
              </button>
            </div>

            {/* Content - Chat, Planner, or Progress */}
            {activeTab === 'planner' ? (
              <div className="flex-1 min-h-0 overflow-hidden">
                <WeeklyPlanner theme={theme} />
              </div>
            ) : activeTab === 'progress' ? (
              <div className="flex-1 min-h-0 overflow-hidden">
                <WeightProgressTracker theme={theme} />
              </div>
            ) : (
              <>

            {/* Model Download Banner */}
            {localModelSupported && !localModelReady && (
              <div className={cn("relative z-10 px-4 py-3 border-b", theme === 'gymgirl' ? 'bg-pink-50 border-pink-200' : theme === 'light' ? 'bg-zinc-50 border-zinc-200' : 'bg-zinc-800/50 border-zinc-700/50')}>
                <div className="flex items-center gap-3">
                  <Cpu className={cn("w-5 h-5", styles.quickActionIcon)} />
                  <div className="flex-1">
                    <p className={cn("text-sm font-medium", styles.title)}>Offline AI Available</p>
                    <p className={cn("text-xs", styles.subtitle)}>Download for offline use</p>
                  </div>
                </div>
                {downloadProgress > 0 && (
                  <div className="mt-2 h-1 bg-zinc-700 rounded-full overflow-hidden">
                    <div className={cn("h-full transition-all", styles.sendButton)} style={{ width: `${downloadProgress}%` }} />
                  </div>
                )}
                {modelError && <p className="text-xs text-red-400 mt-1">{modelError}</p>}
                <div className="flex gap-2 mt-2">
                  {!isDownloading && (
                    <button onClick={handleStartDownload} className={cn("px-3 py-1.5 text-xs font-medium rounded-lg text-white", styles.sendButton)}>Download</button>
                  )}
                  {isDownloading && (
                    <>
                      <button onClick={handlePauseResume} className={cn("px-3 py-1.5 text-xs rounded-lg", theme === 'gymgirl' ? 'bg-pink-100 text-pink-600' : 'bg-zinc-700 text-white')}>{isPaused ? 'Resume' : 'Pause'}</button>
                      <button onClick={handleCancelDownload} className="px-3 py-1.5 text-xs rounded-lg bg-red-500/20 text-red-400">Cancel</button>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Messages */}
            <div ref={scrollRef} className="relative z-10 flex-1 overflow-y-auto px-4 py-4">
              {isLoadingHistory ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className={cn("w-6 h-6 animate-spin", styles.quickActionIcon)} />
                  <span className={cn("ml-2 text-sm", styles.subtitle)}>{t('coach.loadingHistory')}</span>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((message) => (
                    <motion.div
                      key={message.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={cn("flex gap-2", message.role === 'user' ? "justify-end" : "justify-start")}
                    >
                      {message.role === 'assistant' && (
                        <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1", theme === 'gymgirl' ? 'bg-pink-100' : theme === 'light' ? 'bg-orange-50' : 'bg-gradient-to-br from-orange-500/20 to-red-500/20')}>
                          <Sparkles className={cn("w-4 h-4", styles.quickActionIcon)} />
                        </div>
                      )}

                      <div className={cn("max-w-[85%] rounded-2xl px-4 py-3", message.role === 'user' ? cn(styles.userBubble, "rounded-br-md") : cn(styles.assistantBubble, "rounded-bl-md"))}>
                        <div className="text-[15px] leading-relaxed whitespace-pre-wrap">
                          {message.content ? renderContent(message.content, styles.accent) : (
                            <div className="flex gap-1">
                              {[0, 1, 2].map((i) => (
                                <motion.span key={i} className={cn("w-2 h-2 rounded-full", styles.typingDot)}
                                  animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
                                  transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                        
                        {message.role === 'assistant' && message.content && message.id !== 'welcome' && (
                          <div className={cn("flex items-center gap-1.5 mt-2 pt-2 border-t", styles.border)}>
                            <div className={cn("w-1.5 h-1.5 rounded-full", message.source === 'cloud_model' ? styles.sourceCloud : styles.sourceLocal)} />
                            <span className={cn("text-[10px] uppercase tracking-wider", styles.subtitle)}>
                              {message.source === 'cloud_model' ? 'Cloud' : 'On-Device'}
                            </span>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ))}

                  {isLoading && messages[messages.length - 1]?.content && (
                    <div className="flex justify-center">
                      <button onClick={handleCancel} className="text-xs text-red-400 hover:text-red-300 px-3 py-1">{t('coach.stopGenerating')}</button>
                    </div>
                  )}
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick Actions */}
            {messages.length <= 2 && !isLoading && !isLoadingHistory && (
              <div className="relative z-10 px-4 pb-2">
                <div className="flex gap-2 overflow-x-auto scrollbar-hide">
                  {QUICK_ACTIONS.map((action, i) => (
                    <button key={i} onClick={() => sendMessage(action.text)} className={cn("flex items-center gap-2 px-4 py-2.5 rounded-full border text-sm whitespace-nowrap active:scale-95 transition-all shrink-0", styles.quickAction)}>
                      <action.icon className={cn("w-4 h-4", styles.quickActionIcon)} />
                      {action.text}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Input Area */}
            <div className={cn("relative z-10 border-t", styles.border, styles.container)}>
              <form onSubmit={handleSubmit} className="flex items-end gap-2 p-3 pb-[calc(env(safe-area-inset-bottom,12px)+12px)]">
                <div className="flex-1 relative">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); }}}
                    placeholder={t('coach.placeholder')}
                    rows={1}
                    className={cn("w-full resize-none rounded-2xl px-4 py-3 text-[16px] border focus:outline-none focus:ring-2", styles.input)}
                    style={{ maxHeight: '100px' }}
                    disabled={isLoading}
                  />
                </div>

                <button
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  className={cn("w-12 h-12 min-w-[48px] rounded-full flex items-center justify-center transition-all active:scale-95", input.trim() && !isLoading ? cn(styles.sendButton, "text-white") : styles.sendButtonDisabled)}
                  aria-label="Send"
                >
                  {isLoading ? <div className="w-5 h-5 border-2 border-zinc-500 border-t-white rounded-full animate-spin" /> : <Send className="w-5 h-5" />}
                </button>
              </form>
            </div>
            </>
            )}
          </motion.div>
        )}
      </AnimatePresence>,
      document.body
    )}
    
    {/* Professional Confirmation Modal */}
    <ConfirmModal
      isOpen={showConfirmModal}
      onClose={() => setShowConfirmModal(false)}
      onConfirm={handleModalConfirm}
      title={confirmModalType === 'clear' ? 'Clear Chat History' : 'Update Weekly Plan'}
      message={confirmModalType === 'clear' 
        ? 'This will permanently delete all your conversation history with Iron Coach. Your weekly plan will remain unchanged.'
        : 'This will regenerate your weekly plan based on your latest fitness data, goals, and progress. Your current plan will be replaced.'
      }
      confirmText={confirmModalType === 'clear' ? 'Clear History' : 'Update Plan'}
      cancelText="Cancel"
      variant={confirmModalType === 'clear' ? 'danger' : 'warning'}
      isLoading={isClearing}
      theme={theme}
    />
    </>
  );
}

export default IronCoach;
