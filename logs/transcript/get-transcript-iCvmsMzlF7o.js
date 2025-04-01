
        const { default: getTranscript } = require('youtube-transcript-api');
        
        async function main() {
          try {
            const transcript = await getTranscript('iCvmsMzlF7o');
            console.log(JSON.stringify(transcript));
            process.exit(0);
          } catch (error) {
            console.error(error.message);
            process.exit(1);
          }
        }
        
        main();
      