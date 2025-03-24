import { users, categories, videos, type User, type InsertUser, type InsertCategory, type Category, type Video, type InsertVideo } from "@shared/schema";

// modify the interface with any CRUD methods
// you might need

export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Category methods
  getCategory(id: number): Promise<Category | undefined>;
  getCategoriesByUserId(userId: number): Promise<Category[]>;
  createCategory(category: InsertCategory): Promise<Category>;
  
  // Video methods
  getVideo(id: number): Promise<Video | undefined>;
  getVideosByUserId(userId: number): Promise<Video[]>;
  insertVideo(video: InsertVideo): Promise<Video>;
  updateVideo(id: number, data: Partial<Video>): Promise<Video | undefined>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private categories: Map<number, Category>;
  private videos: Map<number, Video>;
  private userIdCounter: number;
  private categoryIdCounter: number;
  private videoIdCounter: number;

  constructor() {
    this.users = new Map();
    this.categories = new Map();
    this.videos = new Map();
    this.userIdCounter = 1;
    this.categoryIdCounter = 1;
    this.videoIdCounter = 1;
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.userIdCounter++;
    const now = new Date();
    const user: User = { ...insertUser, id, created_at: now };
    this.users.set(id, user);
    return user;
  }

  // Category methods
  async getCategory(id: number): Promise<Category | undefined> {
    return this.categories.get(id);
  }

  async getCategoriesByUserId(userId: number): Promise<Category[]> {
    return Array.from(this.categories.values()).filter(
      (category) => category.user_id === userId
    );
  }

  async createCategory(insertCategory: InsertCategory): Promise<Category> {
    const id = this.categoryIdCounter++;
    const category: Category = { ...insertCategory, id };
    this.categories.set(id, category);
    return category;
  }

  // Video methods
  async getVideo(id: number): Promise<Video | undefined> {
    return this.videos.get(id);
  }

  async getVideosByUserId(userId: number): Promise<Video[]> {
    return Array.from(this.videos.values()).filter(
      (video) => video.user_id === userId
    );
  }

  async insertVideo(insertVideo: InsertVideo): Promise<Video> {
    const id = this.videoIdCounter++;
    const now = new Date();
    const video: Video = { ...insertVideo, id, created_at: now };
    this.videos.set(id, video);
    return video;
  }

  async updateVideo(id: number, data: Partial<Video>): Promise<Video | undefined> {
    const video = this.videos.get(id);
    if (!video) return undefined;
    
    const updatedVideo: Video = { ...video, ...data };
    this.videos.set(id, updatedVideo);
    return updatedVideo;
  }
}

export const storage = new MemStorage();
