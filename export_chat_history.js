const fs = require('fs');
const readline = require('readline');
const path = require('path');

const transcriptPath = 'C:/Users/samee/.gemini/antigravity/brain/a437a522-7b4e-4e18-b506-70bbca7ee791/.system_generated/logs/transcript_full.jsonl';
const fallbackPath = 'C:/Users/samee/.gemini/antigravity/brain/a437a522-7b4e-4e18-b506-70bbca7ee791/.system_generated/logs/transcript.jsonl';

function cleanUserPrompt(raw) {
  if (!raw) return '';
  let cleaned = raw;
  // Extract content inside <USER_REQUEST> if present
  const userReqMatch = cleaned.match(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/i);
  if (userReqMatch) {
    cleaned = userReqMatch[1].trim();
  } else {
    // Strip metadata block
    cleaned = cleaned.replace(/<ADDITIONAL_METADATA>[\s\S]*?<\/ADDITIONAL_METADATA>/gi, '').trim();
    cleaned = cleaned.replace(/<\/?USER_REQUEST>/gi, '').trim();
  }
  return cleaned.trim();
}

async function generateChatHistory() {
  const targetFile = fs.existsSync(transcriptPath) ? transcriptPath : fallbackPath;
  console.log('Reading transcript from:', targetFile);

  const fileStream = fs.createReadStream(targetFile, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  const conversation = [];
  let currentTurn = null;

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      const { type, source, created_at, content } = entry;

      if (type === 'USER_INPUT') {
        if (currentTurn) {
          conversation.push(currentTurn);
        }
        currentTurn = {
          role: 'user',
          time: created_at,
          rawContent: content || '',
          content: cleanUserPrompt(content || ''),
          responses: []
        };
      } else if (type === 'PLANNER_RESPONSE' && currentTurn) {
        if (content && content.trim()) {
          currentTurn.responses.push({
            role: 'assistant',
            time: created_at,
            content: content.trim()
          });
        }
      }
    } catch (err) {
      // ignore JSON parse errors
    }
  }

  if (currentTurn) {
    conversation.push(currentTurn);
  }

  console.log(`Extracted ${conversation.length} conversation turns.`);

  // Build Markdown Document
  let md = `# Elvaris Capital & Tradeify Quant Research — Complete Conversation Transcript\n\n`;
  md += `> **Last Updated**: ${new Date().toISOString()}\n`;
  md += `> **Conversation ID**: \`a437a522-7b4e-4e18-b506-70bbca7ee791\`\n`;
  md += `> **Repository**: [Sameet728/elvaris-pinecore](https://github.com/Sameet728/elvaris-pinecore)\n`;
  md += `> **Total Turns**: ${conversation.length} User Requests and Complete Strategy Research Responses\n\n`;
  md += `This document is automatically updated and maintained to preserve the entire chronological dialogue, strategy engineering steps, backtest results, and architectural breakthroughs.\n\n`;
  md += `---\n\n`;

  md += `## Table of Contents\n\n`;
  conversation.forEach((turn, idx) => {
    let summary = turn.content.split('\n')[0].replace(/[#*`\[\]]/g, '').trim();
    if (summary.length > 80) summary = summary.slice(0, 77) + '...';
    if (!summary) summary = 'System prompt / tool execution';
    const timeStr = turn.time ? new Date(turn.time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC' : 'Turn ' + (idx + 1);
    md += `- [Turn ${idx + 1} (${timeStr}): ${summary}](#turn-${idx + 1})\n`;
  });
  md += `\n---\n\n`;

  conversation.forEach((turn, idx) => {
    const turnNum = idx + 1;
    const timeStr = turn.time ? new Date(turn.time).toUTCString() : 'Unknown';
    md += `<a id="turn-${turnNum}"></a>\n`;
    md += `## Turn ${turnNum} (${timeStr})\n\n`;
    md += `### 👤 User:\n\n`;
    md += `${turn.content}\n\n`;

    if (turn.responses && turn.responses.length > 0) {
      md += `### 🤖 Antigravity Assistant:\n\n`;
      turn.responses.forEach((resp) => {
        md += `${resp.content}\n\n`;
      });
    } else {
      md += `*Action executed in workspace / subagent tasks.*\n\n`;
    }

    md += `---\n\n`;
  });

  const outputPath = path.resolve('CHAT_HISTORY.md');
  fs.writeFileSync(outputPath, md, 'utf8');
  console.log('Saved clean chat history to:', outputPath, `(${md.length} characters)`);

  fs.writeFileSync(path.resolve('FULL_CONVERSATION_HISTORY.md'), md, 'utf8');
}

generateChatHistory().catch(console.error);
