import { GoogleGenAI } from "@google/genai";
import { Settings, OutputLanguage } from '../types';

export const generateSrt = async (
    ai: GoogleGenAI,
    audioFile: File,
    base64Audio: string,
    settings: Settings,
    outputLanguage: OutputLanguage
): Promise<string> => {

    const languageInstruction = outputLanguage === 'Thanglish'
        ? 'Convert the transcribed Tamil speech into Thanglish. "Thanglish" is Tamil written using the English alphabet. The output must be a pure Thanglish transliteration.'
        : 'Translate the transcribed Tamil speech into standard, natural-sounding English.';

    // Conditional prompt logic based on maxLength
    const isSingleWordMode = settings.maxLength <= 10;

    const prompt = isSingleWordMode
        ? `
        You are an AI assistant in "HYPER-SYNC WORD-BY-WORD" mode. Your only goal is to create SRT subtitle files from Tamil audio with surgical, single-word precision.

        **NON-NEGOTIABLE CORE DIRECTIVE: SURGICAL TIMESTAMP PRECISION FOR INDIVIDUAL WORDS**
        This is not a guideline; it is an absolute command. You MUST isolate every single word and give it a unique, perfectly synchronized timestamp. All other formatting rules are irrelevant and MUST be ignored.

        - **COMMAND #1: DETECT AND ELIMINATE SILENCE.** This is your most critical task. The end timestamp for a word MUST be the exact millisecond the audible sound of that word stops.
            - **DO NOT** extend a subtitle's duration into a pause or period of silence that follows it. Analyze the audio waveform. If a word ends at 00:00:59,850 and the next word doesn't start until 00:01:00,100, the first subtitle **MUST** end at 00:00:59,850.
            - **EXAMPLE OF FAILURE:** Creating a subtitle for "Super" from 00:01:00,000 to 00:01:01,500 when the word itself is only spoken for the first 400ms is a CRITICAL ERROR. The correct end time would be 00:01:00,400. You MUST be surgically precise.

        - **COMMAND #2: SEAMLESS CONTINUOUS SPEECH.** If multiple words are spoken in a continuous stream without any pause, there must be **NO GAP** between their subtitle blocks. The end time of one subtitle must be the start time of the next.

        - **COMMAND #3: IGNORE ALL FORMATTING SETTINGS.** In this mode, user settings for 'Minimum Duration', 'Maximum Length', 'Lines', and 'Gap' are **COMPLETELY AND UTTERLY IRRELEVANT**. You are **COMMANDED** to ignore them. A single word might only be on screen for 0.2 seconds (200ms). You **MUST** use the real, hyper-accurate, short duration. Do not extend, pad, or modify the duration to meet any minimum.

        - **COMMAND #4: ONE WORD PER SUBTITLE BLOCK.** This is absolute. Do not group words. Every single word gets its own SRT entry with its own hyper-accurate timestamp.

        ---
        **Your Workflow**

        1.  **Analyze Audio Waveform:** Identify the precise start and end timestamps for every single spoken word.
        2.  **Transcribe & Process Language:** Transcribe the Tamil for each word, then perform the user's choice: ${languageInstruction}.
        3.  **Create SRT Blocks:** Use your hyper-accurate timestamps to build the SRT, with one word per block.

        ---
        **Final Output Requirement**

        Your response must be ONLY the raw SRT file content. Do not include any other text, explanations, or markdown like \`\`\`srt. Start directly with sequence number 1.
        `
        : `
        You are an AI assistant that creates professional, accurately synchronized SRT subtitle files from Tamil audio. Your primary goal is perfect timing, with formatting preferences as a secondary objective.

        **NON-NEGOTIABLE CORE DIRECTIVE: TIMESTAMP PRECISION IS PARAMOUNT**
        Your performance is measured on a video editing timeline against the audio waveform. Inaccurate timing is a critical failure.

        - **COMMAND #1: DETECT AND ELIMINATE SILENCE.** This is your most critical task. The end timestamp for a subtitle block MUST be the exact millisecond the audible sound of the last word in that block stops. Do not extend durations into silent pauses.

        - **COMMAND #2: SEAMLESS CONTINUOUS SPEECH.** If multiple words are spoken in a continuous stream without any pause, there must be **NO GAP** between their subtitle blocks. The end time of one subtitle must be the start time of the next.

        - **COMMAND #3: INTELLIGENTLY APPLY USER PREFERENCES.** The user's settings are important, but they must **NEVER** compromise timestamp accuracy. Accuracy **ALWAYS** comes first.
            - **Workflow:** First, determine the perfect timestamps. Second, attempt to apply the following rules to the timed text. If a rule conflicts with timing, ignore the rule.
            - **Maximum Character Length (User preference: ${settings.maxLength} chars):** Group words into readable phrases that respect this limit. **BUT**, if a single word exceeds this limit, let it stand alone. If grouping words would create a timing inaccuracy, split them into smaller, accurately-timed groups, even if they are very short.
            - **Minimum Duration (User preference: ${settings.minDuration} secs):** Aim for this duration, but if a word or phrase is naturally spoken faster, you **MUST** use the real, shorter duration. Never artificially extend a subtitle's duration.
            - **Line Preference (User preference: ${settings.lines}):** Format the text into single or double lines as requested.
            - **Gap Between Captions (User preference: ${settings.gap} frames):** Apply this gap only during natural pauses in the audio. In continuous speech, there should be no gap.
            - **Maximum Duration:** A single subtitle block should not stay on screen for more than **7 seconds**. Split longer sentences.

        - **COMMAND #4: NO HYPHENS.** Do not use hyphens (-) in any way.

        ---
        **Language Processing**

        After transcribing the Tamil speech for each segment, perform the user's choice: ${languageInstruction}.

        ---
        **Final Output Requirement**

        Your response must be ONLY the raw SRT file content. Do not include any other text, explanations, or markdown like \`\`\`srt. Start directly with sequence number 1.
        `;

    const audioPart = {
        inlineData: {
            mimeType: audioFile.type,
            data: base64Audio,
        },
    };

    const textPart = {
        text: prompt,
    };

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [audioPart, textPart] },
    });

    return response.text.trim();
};
