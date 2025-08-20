import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { spawn } from 'child_process';
import chalk from 'chalk';

export async function analyzeConversations(projectsPath, spinner) {
  const conversations = await extractAllConversations(projectsPath, spinner);
  
  // Count unique projects
  const uniqueProjects = new Set(conversations.map(c => c.project)).size;
  spinner.text = `Found ${conversations.length} chats from ${uniqueProjects} projects`;
  
  // Just collect all insights as strings
  const allInsights = [];
  
  // Process first 20 conversations (or all if less)
  const toAnalyze = conversations.slice(0, Math.min(20, conversations.length));
  
  for (const [index, conversation] of toAnalyze.entries()) {
    const projectName = conversation.project.split('-').pop();
    spinner.text = `Analyzing conversation ${index + 1}/${toAnalyze.length} from ${projectName}...`;
    
    const insight = await analyzeWithClaude(conversation);
    if (insight && insight.length > 0) {
      allInsights.push(insight);
      // Show a quick preview of what we found
      const firstRule = insight.split('\n')[0];
      if (firstRule) {
        spinner.text = `Found: ${firstRule.substring(0, 50)}...`;
      }
    }
  }
  
  // Join all insights into one big string
  const combinedInsights = allInsights.join('\n\n');
  
  return {
    projectCount: conversations.length,
    conversationCount: toAnalyze.length,
    insights: combinedInsights
  };
}

async function extractAllConversations(projectsPath, spinner) {
  const conversations = [];
  const projects = readdirSync(projectsPath).filter(dir => 
    statSync(join(projectsPath, dir)).isDirectory()
  );
  
  for (const project of projects) {
    const projectPath = join(projectsPath, project);
    const jsonlFiles = readdirSync(projectPath).filter(file => file.endsWith('.jsonl'));
    
    for (const file of jsonlFiles) {
      spinner.text = `Reading ${project}/${file}...`;
      const conversation = await extractConversation(join(projectPath, file));
      if (conversation && conversation.messages.length > 0) {
        conversations.push({
          project,
          file,
          messages: conversation.messages,
          metadata: conversation.metadata
        });
      }
    }
  }
  
  return conversations;
}

async function extractConversation(filePath) {
  const messages = [];
  const metadata = {};
  
  const fileStream = createReadStream(filePath);
  const rl = createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    try {
      const entry = JSON.parse(line);
      
      if (entry.type === 'user' && entry.message?.content) {
        messages.push({
          role: 'user',
          content: entry.message.content,
          timestamp: entry.timestamp
        });
      }
      
      if (entry.type === 'assistant' && entry.message?.content) {
        let assistantMessage = '';
        for (const item of entry.message.content) {
          if (item.type === 'text') {
            assistantMessage += item.text;
          } else if (item.type === 'tool_use') {
            assistantMessage += `[Used tool: ${item.name}]`;
          }
        }
        if (assistantMessage) {
          messages.push({
            role: 'assistant',
            content: assistantMessage,
            timestamp: entry.timestamp
          });
        }
      }
      
      if (entry.cwd && !metadata.cwd) {
        metadata.cwd = entry.cwd;
      }
    } catch (e) {
      // Skip malformed lines
    }
  }
  
  return { messages, metadata };
}

async function analyzeWithClaude(conversation) {
  if (conversation.messages.length < 2) {
    return null;
  }
  
  // Extract only USER messages to reduce tokens
  const userMessages = conversation.messages
    .filter(m => m.role === 'user')
    .slice(0, 5) // Only first 5 messages
    .map(m => {
      if (typeof m.content === 'string') {
        // Truncate to 200 chars max
        return m.content.length > 200 ? m.content.substring(0, 200) + '...' : m.content;
      }
      return '';
    })
    .filter(m => m.length > 0)
    .join('\n');
  
  if (!userMessages) {
    return null;
  }
  
  const prompt = `Analyze these user messages and write 3-5 concise rules for CLAUDE.md:
${userMessages}

Focus on their communication style, technical preferences, and what frustrates them.
Write as short directives like:
- Keep responses brief
- Never add code comments
- Use existing files instead of creating new ones`;

  // Skip AI analysis in dry-run mode
  if (process.argv.includes('--dry-run')) {
    return "- Prefers brief responses\n- No code comments\n- Values simplicity";
  }
  
  try {
    // Use spawn with stdin pipe - super simple
    return await new Promise((resolve) => {
      const claude = spawn('claude', ['-p']);
      
      let output = '';
      
      claude.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      // Write prompt to stdin and close it
      claude.stdin.write(prompt);
      claude.stdin.end();
      
      // Set timeout
      const timeout = setTimeout(() => {
        claude.kill();
        resolve(""); // Just return empty string on timeout
      }, 15000);
      
      claude.on('close', () => {
        clearTimeout(timeout);
        // Just return whatever we got as a string
        resolve(output || "");
      });
      
      claude.on('error', () => {
        clearTimeout(timeout);
        resolve("");
      });
    });
  } catch (error) {
    return ""; // Return empty string on any error
  }
}