declare module 'youtube-transcript-api' {
  interface TranscriptItem {
    text: string;
    start: number;
    duration: number;
  }
  
  function TranscriptAPI(videoId: string): Promise<TranscriptItem[]>;
  
  export default TranscriptAPI;
}