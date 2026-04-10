import type { IronCoachComplexity, IronCoachRoutingDecision, IronCoachRoutingInput } from './types';

const COMPLEX_KEYWORDS = [
  '12-week', 'periodization', 'periodisation', 'macrocycle', 'mesocycle',
  'hypertrophy plan', 'long-term plan', 'protocol', 'research-backed', 'biomechanics'
];

const SIMPLE_KEYWORDS = [
  'today', 'quick', 'what workout', 'what should i eat', 'calories today', 'protein today'
];

export function detectComplexity(question: string): IronCoachComplexity {
  const q = question.toLowerCase();

  if (COMPLEX_KEYWORDS.some((keyword) => q.includes(keyword)) || q.length > 220) {
    return 'complex';
  }

  if (SIMPLE_KEYWORDS.some((keyword) => q.includes(keyword)) || q.length < 80) {
    return 'simple';
  }

  return 'moderate';
}

export function routeIronCoachRequest(input: IronCoachRoutingInput): IronCoachRoutingDecision {
  const complexity = detectComplexity(input.question);

  if (input.forceCloud) {
    return { source: 'cloud_model', complexity, reason: 'Forced cloud mode by caller' };
  }

  if (input.forceLocal) {
    return {
      source: input.device.modelReady && input.device.supportsLocalInference ? 'local_model' : 'cloud_model',
      complexity,
      reason: 'Forced local mode by caller'
    };
  }

  if (!input.isOnline) {
    if (input.device.modelReady && input.device.supportsLocalInference) {
      return { source: 'local_model', complexity, reason: 'Offline and local model is ready' };
    }
    return { source: 'cloud_model', complexity, reason: 'Offline but local model unavailable' };
  }

  if (!input.device.modelReady || !input.device.supportsLocalInference) {
    return { source: 'cloud_model', complexity, reason: 'Local model unavailable on this device' };
  }

  if (complexity === 'complex') {
    return { source: 'cloud_model', complexity, reason: 'Complex request routed to cloud model' };
  }

  return { source: 'local_model', complexity, reason: 'Simple/moderate request handled locally' };
}
