import { db } from '../db';
import { sql } from 'drizzle-orm';
import { log } from '../vite';

/**
 * Initialize pgvector functions in PostgreSQL
 * This ensures the vector extension is enabled and necessary functions are created
 */
export async function initializeVectorFunctions(): Promise<void> {
  try {
    // Enable pgvector extension if not already enabled
    await db.execute(sql`
      CREATE EXTENSION IF NOT EXISTS vector;
    `);
    
    log("Vector search functions initialized");
    return;
  } catch (error) {
    console.error("Failed to initialize vector functions:", error);
    throw error;
  }
}

/**
 * Calculate cosine similarity between two embedding vectors
 * @param a First embedding vector
 * @param b Second embedding vector
 * @returns Similarity score between 0 and 1
 */
export function calculateCosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length) {
    return 0;
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);
  
  if (normA === 0 || normB === 0) {
    return 0;
  }
  
  return dotProduct / (normA * normB);
}