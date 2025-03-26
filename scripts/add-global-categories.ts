
import { db } from "../server/db";
import { categories } from "../shared/schema";
import { count, eq } from "drizzle-orm";
import { log } from "../server/vite";

export async function addGlobalCategories() {
  const globalCategories = [
    { name: "Educational", is_global: true },
    { name: "AI Dev", is_global: true },
    { name: "Agentic Flow", is_global: true }
  ];
  
  log("Checking for existing global categories...", "migration");
  
  try {
    // Check which global categories already exist
    const existingGlobals = await db.select()
      .from(categories)
      .where(eq(categories.is_global, true));
    
    // If we already have all of them, we can skip
    if (existingGlobals.length >= globalCategories.length) {
      const existingNames = new Set(existingGlobals.map(category => category.name));
      const allExist = globalCategories.every(category => existingNames.has(category.name));
      
      if (allExist) {
        log(`All global categories already exist. Skipping migration.`, "migration");
        return;
      }
    }
    
    // Get the system user ID (typically 1)
    // In a production app, you'd have a specific system user
    const systemUserId = 1;
    
    log("Adding global categories...", "migration");
    
    // Create a Set of existing category names for faster lookup
    const existingNames = new Set();
    const allCategories = await db.select().from(categories);
    allCategories.forEach(category => existingNames.add(category.name));
    
    // Add each global category
    for (const category of globalCategories) {
      try {
        if (existingNames.has(category.name)) {
          // Update existing category to be global
          await db.update(categories)
            .set({ is_global: true })
            .where(eq(categories.name, category.name));
          log(`Updated existing category to global: ${category.name}`, "migration");
        } else {
          // Add new global category
          await db.insert(categories).values({
            name: category.name,
            user_id: systemUserId,
            is_global: true
          });
          log(`Added global category: ${category.name}`, "migration");
          // Add to our tracked set of names
          existingNames.add(category.name);
        }
      } catch (err) {
        // Handle race conditions or other errors
        log(`Error processing category ${category.name}: ${err}`, "migration");
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
