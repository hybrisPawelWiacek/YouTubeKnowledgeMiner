
import { db } from "../server/db";
import { categories } from "../shared/schema";
import { count, eq } from "drizzle-orm";
import { log } from "../server/vite";

async function addGlobalCategories() {
  const globalCategories = [
    { name: "Educational", is_global: true },
    { name: "AI Dev", is_global: true },
    { name: "Agentic Flow", is_global: true }
  ];
  
  log("Checking for existing global categories...", "migration");
  
  try {
    // Check if we already have any global categories
    const existingGlobals = await db.select({ count: count() })
      .from(categories)
      .where(eq(categories.is_global, true));
    
    if (existingGlobals[0].count > 0) {
      log(`Found ${existingGlobals[0].count} existing global categories. Skipping migration.`, "migration");
      return;
    }
    
    // Get the system user ID (typically 1)
    // In a production app, you'd have a specific system user
    const systemUserId = 1;
    
    log("Adding global categories...", "migration");
    
    // Add each global category
    for (const category of globalCategories) {
      // Check if this category name already exists
      const existingCategory = await db.select()
        .from(categories)
        .where(eq(categories.name, category.name));
      
      if (existingCategory.length === 0) {
        await db.insert(categories).values({
          name: category.name,
          user_id: systemUserId,
          is_global: true
        });
        log(`Added global category: ${category.name}`, "migration");
      } else {
        // Update existing category to be global
        await db.update(categories)
          .set({ is_global: true })
          .where(eq(categories.name, category.name));
        log(`Updated existing category to global: ${category.name}`, "migration");
      }
    }
    
    log("Global categories migration completed successfully", "migration");
  } catch (error) {
    log(`Error adding global categories: ${error}`, "migration");
    throw error;
  }
}

// Execute the migration
addGlobalCategories().catch(console.error);
