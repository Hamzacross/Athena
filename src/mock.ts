import type { Conversation } from "./types";

const now = Date.now();
const min = 60_000;

export const mockConversations: Conversation[] = [
  {
    id: "c1",
    title: "Open VS Code and today's tasks",
    updatedAt: now - 4 * min,
    messages: [
      { id: "m1", role: "user", text: "Hey Athena, open VS Code and my project folder.", at: now - 6 * min },
      { id: "m2", role: "assistant", text: "Opening VS Code with your Athena project now. Anything else?", at: now - 5 * min },
      { id: "m3", role: "user", text: "What did I work on yesterday?", at: now - 5 * min },
      { id: "m4", role: "assistant", text: "Yesterday you refined the whiteboard hand-tracking and saved two screenshots to your workspace.", at: now - 4 * min },
    ],
  },
  {
    id: "c2",
    title: "Take a screenshot",
    updatedAt: now - 3 * 60 * min,
    messages: [
      { id: "m5", role: "user", text: "Take a screenshot of my screen.", at: now - 3 * 60 * min },
      { id: "m6", role: "assistant", text: "Captured. Saved to your workspace under Screenshots.", at: now - 3 * 60 * min },
    ],
  },
  {
    id: "c3",
    title: "Search the web for Rust async",
    updatedAt: now - 26 * 60 * min,
    messages: [
      { id: "m7", role: "user", text: "Search the web for Tokio async best practices.", at: now - 26 * 60 * min },
      { id: "m8", role: "assistant", text: "Here are the top results on structuring Tokio tasks and avoiding blocking calls.", at: now - 26 * 60 * min },
    ],
  },
];
