/**
 * This script sets up demo users with sample content for testing purposes.
 * It creates the demo user accounts if they don't exist and populates
 * them with sample videos, collections, categories, and other content.
 */
import { db } from '../server/db';
import { users, videos, categories, collections, collection_videos, qa_conversations } from '../shared/schema';
import { eq } from 'drizzle-orm';
import { createHash } from 'crypto';

// Demo users definition - matching the demo-auth.routes.ts file
const DEMO_USERS = [
  {
    username: 'demo_basic',
    email: 'demo_basic@example.com',
    password: 'demo_password',
    displayName: 'Demo User',
    description: 'Regular user with basic content'
  },
  {
    username: 'demo_power',
    email: 'demo_power@example.com',
    password: 'demo_password',
    displayName: 'Power User',
    description: 'Power user with extensive content and customizations'
  }
];

// Sample video data for demo users
const BASIC_USER_VIDEOS = [
  {
    youtube_id: 'dQw4w9WgXcQ',
    title: 'Rick Astley - Never Gonna Give You Up (Official Music Video)',
    channel: 'Rick Astley',
    duration: '3:33',
    publish_date: '2009-10-25',
    thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    views: '1,200,000,000+',
    likes: '14M',
    description: 'The official music video for "Never Gonna Give You Up" by Rick Astley',
    tags: ['Rick Astley', 'Music Video', 'Pop'],
    rating: 5,
    is_favorite: true
  },
  {
    youtube_id: 'Wbtx0jzzFFg',
    title: 'Demo: Building with Replit AI Agents - James Wilson',
    channel: 'GitHub',
    duration: '38:25',
    publish_date: '2023-12-20',
    thumbnail: 'https://i.ytimg.com/vi/Wbtx0jzzFFg/hqdefault.jpg',
    views: '9,453',
    likes: '247',
    description: 'GitHub Universe 2023: Demo of building with Replit AI',
    tags: ['Replit', 'AI', 'Demo'],
    rating: 4,
    is_favorite: false
  }
];

// More sample video data for the power user
const POWER_USER_VIDEOS = [
  ...BASIC_USER_VIDEOS,
  {
    youtube_id: '9bZkp7q19f0',
    title: 'PSY - GANGNAM STYLE(강남스타일) M/V',
    channel: 'officialpsy',
    duration: '4:13',
    publish_date: '2012-07-15',
    thumbnail: 'https://i.ytimg.com/vi/9bZkp7q19f0/hqdefault.jpg',
    views: '4,700,000,000+',
    likes: '25M',
    description: 'The official music video for PSY - GANGNAM STYLE',
    tags: ['PSY', 'Gangnam Style', 'K-Pop'],
    rating: 5,
    is_favorite: true
  },
  {
    youtube_id: 'SQNtGoM3FVU',
    title: 'What is ChatGPT doing ... and why does it work?',
    channel: '3Blue1Brown',
    duration: '23:43',
    publish_date: '2023-05-30',
    thumbnail: 'https://i.ytimg.com/vi/SQNtGoM3FVU/hqdefault.jpg',
    views: '5,400,000+',
    likes: '212K',
    description: 'A good starting place for understanding ChatGPT',
    tags: ['AI', 'ChatGPT', 'Machine Learning'],
    rating: 5,
    is_favorite: true
  },
  {
    youtube_id: '5KnFcsSIzbg',
    title: 'React Crash Course for Beginners 2021',
    channel: 'Academind',
    duration: '2:25:26',
    publish_date: '2021-01-22',
    thumbnail: 'https://i.ytimg.com/vi/5KnFcsSIzbg/hqdefault.jpg',
    views: '742,000+',
    likes: '15K',
    description: 'Learn all the basics you need to get started with React',
    tags: ['React', 'JavaScript', 'Tutorial'],
    rating: 4,
    is_favorite: false
  },
  {
    youtube_id: 'p5X2rw8Q7pc',
    title: 'Building a Complete TypeScript App from Scratch',
    channel: 'Ben Awad',
    duration: '1:35:17',
    publish_date: '2020-09-10',
    thumbnail: 'https://i.ytimg.com/vi/p5X2rw8Q7pc/hqdefault.jpg',
    views: '128,000+',
    likes: '3.5K',
    description: 'Building a complete TypeScript application from scratch',
    tags: ['TypeScript', 'Programming', 'Tutorial'],
    rating: 4,
    is_favorite: false
  }
];

// Sample categories for demo users
const BASIC_USER_CATEGORIES = [
  { name: 'Music', description: 'Music videos' },
  { name: 'Technology', description: 'Tech tutorials and demos' }
];

const POWER_USER_CATEGORIES = [
  ...BASIC_USER_CATEGORIES,
  { name: 'AI', description: 'Artificial intelligence related content' },
  { name: 'Tutorials', description: 'Programming tutorials' },
  { name: 'Entertainment', description: 'Fun videos to watch' },
  { name: 'Must Watch', description: 'Essential videos' }
];

// Sample collections for demo users
const BASIC_USER_COLLECTIONS = [
  { name: 'Favorites', description: 'My favorite videos' }
];

const POWER_USER_COLLECTIONS = [
  ...BASIC_USER_COLLECTIONS,
  { name: 'Learning React', description: 'Videos to learn React' },
  { name: 'AI Explanations', description: 'Videos explaining AI concepts' },
  { name: 'Programming Resources', description: 'Useful programming tutorials' }
];

/**
 * Create or get a user by username
 */
async function getOrCreateUser(userConfig: typeof DEMO_USERS[0]) {
  console.log(`Setting up user: ${userConfig.username}`);
  
  // Check if user exists
  let user = await db.query.users.findFirst({
    where: eq(users.username, userConfig.username),
  });
  
  if (!user) {
    // Create the user if not found
    const hashedPassword = createHash('sha256').update(userConfig.password).digest('hex');
    
    const [newUser] = await db.insert(users)
      .values({
        username: userConfig.username,
        email: userConfig.email,
        password: hashedPassword,
      })
      .returning();
    
    user = newUser;
    console.log(`Created new user: ${userConfig.username} (ID: ${user.id})`);
  } else {
    console.log(`Found existing user: ${userConfig.username} (ID: ${user.id})`);
  }
  
  return user;
}

/**
 * Add categories for a user
 */
async function createCategoriesForUser(userId: number, categoriesToCreate: { name: string, description: string }[]) {
  console.log(`Creating categories for user ${userId}...`);
  
  const results = [];
  
  for (const category of categoriesToCreate) {
    // Check if category already exists for this user
    const existingCategory = await db.query.categories.findFirst({
      where: 
        eq(categories.name, category.name)
    });
    
    if (!existingCategory) {
      const [newCategory] = await db.insert(categories)
        .values({
          name: category.name,
          user_id: userId,
          is_global: false
        })
        .returning();
      
      console.log(`Created category: ${category.name} (ID: ${newCategory.id})`);
      results.push(newCategory);
    } else {
      console.log(`Category already exists: ${category.name} (ID: ${existingCategory.id})`);
      results.push(existingCategory);
    }
  }
  
  return results;
}

/**
 * Add collections for a user
 */
async function createCollectionsForUser(userId: number, collectionsToCreate: { name: string, description: string }[]) {
  console.log(`Creating collections for user ${userId}...`);
  
  const results = [];
  
  for (const collection of collectionsToCreate) {
    // Check if collection already exists for this user
    const existingCollection = await db.query.collections.findFirst({
      where: 
        eq(collections.name, collection.name)
    });
    
    if (!existingCollection) {
      const [newCollection] = await db.insert(collections)
        .values({
          name: collection.name,
          description: collection.description,
          user_id: userId
        })
        .returning();
      
      console.log(`Created collection: ${collection.name} (ID: ${newCollection.id})`);
      results.push(newCollection);
    } else {
      console.log(`Collection already exists: ${collection.name} (ID: ${existingCollection.id})`);
      results.push(existingCollection);
    }
  }
  
  return results;
}

/**
 * Add videos for a user
 */
async function createVideosForUser(userId: number, videosToCreate: any[], userCategories: any[]) {
  console.log(`Creating videos for user ${userId}...`);
  
  const results = [];
  
  for (const videoData of videosToCreate) {
    // Check if video already exists for this user
    const existingVideo = await db.query.videos.findFirst({
      where: 
        eq(videos.youtube_id, videoData.youtube_id)
    });
    
    if (!existingVideo) {
      // Assign category based on tags
      let categoryId = null;
      
      if (videoData.tags.includes('Music')) {
        const musicCategory = userCategories.find(c => c.name === 'Music');
        if (musicCategory) categoryId = musicCategory.id;
      } else if (videoData.tags.includes('AI')) {
        const aiCategory = userCategories.find(c => c.name === 'AI');
        if (aiCategory) categoryId = aiCategory.id;
      } else if (videoData.tags.includes('Tutorial') || videoData.tags.includes('Programming')) {
        const tutorialsCategory = userCategories.find(c => c.name === 'Tutorials');
        if (tutorialsCategory) categoryId = tutorialsCategory.id;
      } else {
        const techCategory = userCategories.find(c => c.name === 'Technology');
        if (techCategory) categoryId = techCategory.id;
      }
      
      const [newVideo] = await db.insert(videos)
        .values({
          ...videoData,
          user_id: userId,
          category_id: categoryId,
        })
        .returning();
      
      console.log(`Created video: ${videoData.title} (ID: ${newVideo.id})`);
      results.push(newVideo);
    } else {
      console.log(`Video already exists: ${videoData.title} (ID: ${existingVideo.id})`);
      results.push(existingVideo);
    }
  }
  
  return results;
}

/**
 * Add videos to collections
 */
async function addVideosToCollections(
  collections: any[], 
  videos: any[], 
  mappings: { collectionName: string, videoTitles: string[] }[]
) {
  console.log(`Adding videos to collections...`);
  
  for (const mapping of mappings) {
    const collection = collections.find(c => c.name === mapping.collectionName);
    
    if (!collection) {
      console.log(`Collection not found: ${mapping.collectionName}`);
      continue;
    }
    
    for (const videoTitle of mapping.videoTitles) {
      const video = videos.find(v => v.title.includes(videoTitle));
      
      if (!video) {
        console.log(`Video not found with title containing: ${videoTitle}`);
        continue;
      }
      
      // Check if video is already in the collection
      const existingRelationship = await db.query.collection_videos.findFirst({
        where: 
          eq(collection_videos.video_id, video.id)
      });
      
      if (!existingRelationship) {
        await db.insert(collection_videos)
          .values({
            collection_id: collection.id,
            video_id: video.id
          });
        
        console.log(`Added video ID ${video.id} to collection ID ${collection.id}`);
      } else {
        console.log(`Video ID ${video.id} already in collection ID ${collection.id}`);
      }
    }
  }
}

/**
 * Add a sample Q&A conversation for a video
 */
async function addSampleConversations(userId: number, videos: any[]) {
  console.log(`Adding sample conversations for user ${userId}...`);
  
  for (const video of videos) {
    // Check if this video already has a conversation
    const existingConversation = await db.query.qa_conversations.findFirst({
      where: 
        eq(qa_conversations.video_id, video.id)
    });
    
    if (!existingConversation && video.title.includes('React')) {
      // Add a sample conversation for React videos
      const [newConversation] = await db.insert(qa_conversations)
        .values({
          video_id: video.id,
          user_id: userId,
          title: 'Questions about React basics',
          messages: JSON.stringify([
            {
              role: 'user',
              content: 'What are the core concepts of React?',
              timestamp: new Date().toISOString()
            },
            {
              role: 'assistant',
              content: 'The core concepts of React include components, props, state, and the virtual DOM. Components are the building blocks, props pass data down the component tree, state manages internal component data, and the virtual DOM efficiently updates the real DOM.',
              timestamp: new Date().toISOString()
            },
            {
              role: 'user',
              content: 'How do hooks work in React?',
              timestamp: new Date().toISOString()
            },
            {
              role: 'assistant',
              content: 'Hooks are functions that let you "hook into" React state and lifecycle features from function components. useState lets you add state, useEffect handles side effects, useContext accesses context, useReducer manages complex state, and there are several others for specific needs.',
              timestamp: new Date().toISOString()
            }
          ])
        })
        .returning();
      
      console.log(`Created conversation for video ID ${video.id}: ${newConversation.title}`);
    } else if (!existingConversation && video.title.includes('AI')) {
      // Add a sample conversation for AI videos
      const [newConversation] = await db.insert(qa_conversations)
        .values({
          video_id: video.id,
          user_id: userId,
          title: 'Questions about AI concepts',
          messages: JSON.stringify([
            {
              role: 'user',
              content: 'What is the difference between AI and machine learning?',
              timestamp: new Date().toISOString()
            },
            {
              role: 'assistant',
              content: 'AI (Artificial Intelligence) is the broader concept of machines being able to carry out tasks in a way that we would consider "smart". Machine Learning is a specific subset of AI that involves training algorithms with data so they can learn patterns and make predictions without being explicitly programmed for specific tasks.',
              timestamp: new Date().toISOString()
            },
            {
              role: 'user',
              content: 'How does ChatGPT actually work?',
              timestamp: new Date().toISOString()
            },
            {
              role: 'assistant',
              content: 'ChatGPT is based on a transformer architecture that uses self-attention mechanisms to understand context in text. It was pre-trained on a large corpus of text data to predict the next token in a sequence, then fine-tuned using reinforcement learning from human feedback (RLHF) to make it more helpful, harmless, and honest in a conversational context.',
              timestamp: new Date().toISOString()
            }
          ])
        })
        .returning();
      
      console.log(`Created conversation for video ID ${video.id}: ${newConversation.title}`);
    } else if (existingConversation) {
      console.log(`Conversation already exists for video ID ${video.id}`);
    }
  }
}

/**
 * Setup a demo user with content
 */
async function setupDemoUser(
  userConfig: typeof DEMO_USERS[0], 
  videosData: any[], 
  categoriesData: { name: string, description: string }[],
  collectionsData: { name: string, description: string }[]
) {
  console.log(`\n===== Setting up demo user: ${userConfig.username} =====`);
  
  // Create or get the user
  const user = await getOrCreateUser(userConfig);
  
  // Add categories for the user
  const userCategories = await createCategoriesForUser(user.id, categoriesData);
  
  // Add videos for the user
  const userVideos = await createVideosForUser(user.id, videosData, userCategories);
  
  // Add collections for the user
  const userCollections = await createCollectionsForUser(user.id, collectionsData);
  
  // Add videos to collections
  const collectionMappings = [];
  
  // Add to Favorites collection
  collectionMappings.push({
    collectionName: 'Favorites',
    videoTitles: videosData
      .filter(v => v.is_favorite)
      .map(v => v.title.substring(0, 20)) // Use just the beginning of the title for matching
  });
  
  // For power user, add to specific collections
  if (userConfig.username === 'demo_power') {
    collectionMappings.push({
      collectionName: 'Learning React',
      videoTitles: ['React Crash Course', 'TypeScript App']
    });
    
    collectionMappings.push({
      collectionName: 'AI Explanations',
      videoTitles: ['What is ChatGPT', 'Replit AI Agents']
    });
    
    collectionMappings.push({
      collectionName: 'Programming Resources',
      videoTitles: ['React Crash Course', 'TypeScript App', 'Replit AI Agents']
    });
  }
  
  await addVideosToCollections(userCollections, userVideos, collectionMappings);
  
  // Add sample conversations for the power user
  if (userConfig.username === 'demo_power') {
    await addSampleConversations(user.id, userVideos);
  }
  
  console.log(`\n✅ Successfully set up demo user: ${userConfig.username}\n`);
  
  return {
    user,
    videos: userVideos,
    categories: userCategories,
    collections: userCollections
  };
}

/**
 * Main function to run the script
 */
async function setupDemoUsers() {
  console.log('Starting setup of demo users...');
  
  try {
    // Setup basic demo user
    await setupDemoUser(
      DEMO_USERS[0],
      BASIC_USER_VIDEOS,
      BASIC_USER_CATEGORIES,
      BASIC_USER_COLLECTIONS
    );
    
    // Setup power demo user
    await setupDemoUser(
      DEMO_USERS[1],
      POWER_USER_VIDEOS,
      POWER_USER_CATEGORIES,
      POWER_USER_COLLECTIONS
    );
    
    console.log('✅ All demo users have been successfully set up!');
    console.log('You can now access them using the demo authentication endpoints:');
    console.log('- GET /api/demo-auth/users - List available demo users');
    console.log('- POST /api/demo-auth/login {username: "demo_basic"} - Login as basic demo user');
    console.log('- POST /api/demo-auth/login {username: "demo_power"} - Login as power demo user');
    
  } catch (error) {
    console.error('Error setting up demo users:', error);
  }
}

// Run the script
setupDemoUsers().then(() => {
  console.log('Demo setup completed.');
  process.exit(0);
}).catch(error => {
  console.error('Fatal error during demo setup:', error);
  process.exit(1);
});