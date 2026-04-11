"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { apiFetch } from "@/lib/mobile-api";

// Types
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatResponse {
  success: boolean;
  message: string;
  confidence: number;
  provenance: {
    source: string;
    modelName: string;
    timestamp: string;
    coachingTone: string;
    contextUsed: boolean;
  };
  error?: string;
}

export interface PhotoAnalysisResponse {
  success: boolean;
  analysis: {
    bodyFatEstimate?: { value: number; confidence: number; rationale: string };
    muscleMassEstimate?: { value: number; confidence: number; rationale: string };
    weightEstimate?: { value: number; confidence: number; rationale: string };
    overallConfidence?: number;
    analysisNotes?: string;
    rawResponse?: string;
    _provenance: {
      source: string;
      modelName: string;
      timestamp: string;
      analysisType: string;
    };
  };
  error?: string;
}

export interface Insight {
  id: string;
  title: string;
  description: string;
  actionSuggestion?: string;
  confidence: number;
  category: "trend" | "anomaly" | "correlation" | "prediction";
  dataSources?: string[];
  priority: number;
  rationale?: string;
  generatedAt: string;
  provenance: {
    source: string;
    modelName: string;
    dataPointsUsed: string[];
    method: string;
  };
}

export interface InsightsResponse {
  success: boolean;
  insights: Insight[];
  generatedAt: string;
  timeframe: string;
  error?: string;
}

export interface MorphResponse {
  success: boolean;
  morphImageUrl: string;
  progressPercentage: number;
  isGenerated: true;
  generatedLabel: string;
  disclaimer: string;
  provenance: {
    source: string;
    modelName: string;
    timestamp: string;
    method: string;
    confidence: number;
    basedOn: string[];
    changesAnalyzed: string;
  };
  canHide: boolean;
  canDelete: boolean;
  optInRequired: boolean;
  userId: string | null;
  error?: string;
}

export interface SignalComposerResponse {
  success: boolean;
  signalComposer: {
    targetInsight: string;
    recommendedInputs: Array<{
      rank: number;
      type: string;
      description: string;
      confidenceImprovement: number;
      effort: "low" | "medium" | "high";
      action: string;
      rationale: string;
    }>;
    totalPotentialImprovement: number;
    currentDataQuality: { score: number; level: string };
    lastUpdated: string;
  };
  provenance: {
    source: string;
    modelName: string;
    method: string;
    timestamp: string;
  };
  error?: string;
}

// Chat API Hook
export function useChat() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const historyRef = useRef(history);
  useEffect(() => { historyRef.current = history; }, [history]);

  const sendMessage = useCallback(
    async (
      message: string,
      options?: {
        coachingTone?: "strict" | "supportive" | "minimal";
        context?: Record<string, unknown>;
      }
    ): Promise<ChatResponse | null> => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await apiFetch("/api/chat", {
          method: "POST",
          body: JSON.stringify({
            message,
            history: historyRef.current,
            coachingTone: options?.coachingTone || "supportive",
            context: options?.context || {},
          }),
        });

        const data: ChatResponse = await response.json();

        if (data.success && data.message) {
          // Update history
          setHistory((prev) => [
            ...prev,
            { role: "user", content: message },
            { role: "assistant", content: data.message },
          ]);
        } else {
          setError(data.error || "Failed to get response");
        }

        return data;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Chat failed";
        setError(errorMessage);
        return { success: false, message: "", confidence: 0, provenance: {} as ChatResponse["provenance"], error: errorMessage };
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const clearHistory = useCallback(() => {
    setHistory([]);
  }, []);

  return { sendMessage, isLoading, error, history, clearHistory };
}

// Photo Analysis API Hook
export function usePhotoAnalysis() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyzePhoto = useCallback(
    async (
      imageUrl: string,
      analysisType: "body-composition" | "meal" | "food-label" = "body-composition"
    ): Promise<PhotoAnalysisResponse | null> => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await apiFetch("/api/analyze-photo", {
          method: "POST",
          body: JSON.stringify({ imageUrl, analysisType }),
        });

        const data: PhotoAnalysisResponse = await response.json();

        if (!data.success) {
          setError(data.error || "Analysis failed");
        }

        return data;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Photo analysis failed";
        setError(errorMessage);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  return { analyzePhoto, isLoading, error };
}

// Insights API Hook
export function useInsights() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);

  const generateInsights = useCallback(
    async (
      userData: Record<string, unknown>,
      timeframe: string = "14 days"
    ): Promise<InsightsResponse | null> => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await apiFetch("/api/insights", {
          method: "POST",
          body: JSON.stringify({ userData, timeframe }),
        });

        const data: InsightsResponse = await response.json();

        if (data.success && data.insights) {
          setInsights(data.insights);
        } else {
          setError(data.error || "Failed to generate insights");
        }

        return data;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Insights generation failed";
        setError(errorMessage);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  return { generateInsights, isLoading, error, insights };
}

// Morph Memory API Hook
export function useMorphMemory() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateMorph = useCallback(
    async (
      startImageUrl: string,
      endImageUrl: string,
      progressPercentage: number = 50,
      userId?: string
    ): Promise<MorphResponse | null> => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await apiFetch("/api/generate-morph", {
          method: "POST",
          body: JSON.stringify({
            startImageUrl,
            endImageUrl,
            progressPercentage,
            userId,
          }),
        });

        const data: MorphResponse = await response.json();

        if (!data.success) {
          setError(data.error || "Morph generation failed");
        }

        return data;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Morph generation failed";
        setError(errorMessage);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  return { generateMorph, isLoading, error };
}

// Signal Composer API Hook
export function useSignalComposer() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getRecommendations = useCallback(
    async (
      userProfile: Record<string, unknown>,
      currentInsightId?: string
    ): Promise<SignalComposerResponse | null> => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await apiFetch("/api/signal-composer", {
          method: "POST",
          body: JSON.stringify({ userProfile, currentInsightId }),
        });

        const data: SignalComposerResponse = await response.json();

        if (!data.success) {
          setError(data.error || "Failed to get recommendations");
        }

        return data;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Signal composition failed";
        setError(errorMessage);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  return { getRecommendations, isLoading, error };
}
