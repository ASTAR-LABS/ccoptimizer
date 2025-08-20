import { spawn } from 'child_process';

export async function generateClaudeMd(insights) {
  // Super simple - just pass all insights to Claude and ask for final CLAUDE.md
  const prompt = `Consolidate these rules from multiple conversations into a clean CLAUDE.md file:

${insights}

Create a well-structured CLAUDE.md with:
- Clear section headings
- Short, declarative bullet points
- No redundancy
- Focus on actionable directives

Output ONLY the final CLAUDE.md content, starting with "# Optimized Claude Instructions".
No explanations, no meta-commentary, just the clean instructions.

Example format:
# Optimized Claude Instructions

## Communication Style
- Keep responses brief and direct
- Skip unnecessary explanations

## Code Preferences  
- Never add code comments
- Use existing files over creating new ones`;

  try {
    const content = await new Promise((resolve) => {
      const claude = spawn('claude', ['-p']);
      
      let output = '';
      
      claude.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      // Write prompt to stdin
      claude.stdin.write(prompt);
      claude.stdin.end();
      
      const timeout = setTimeout(() => {
        claude.kill();
        resolve(null);
      }, 20000);
      
      claude.on('close', () => {
        clearTimeout(timeout);
        resolve(output);
      });
      
      claude.on('error', () => {
        clearTimeout(timeout);
        resolve(null);
      });
    });
    
    if (content && content.includes('# Optimized Claude Instructions')) {
      return content + `\n\n---\n\n*Generated on ${new Date().toLocaleDateString()} by ccoptimizer*`;
    }
  } catch (error) {
    console.error('Generation failed:', error.message);
  }
  
  // Simple fallback
  return `# Optimized Claude Instructions

${insights}

---

*Generated on ${new Date().toLocaleDateString()} by ccoptimizer*`;
}