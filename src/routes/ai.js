const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const { requireAuth } = require('../middleware/auth');
const db = require('../db');
const config = require('../config');

const router = express.Router();

// Lazy client: the route stays mounted (and returns a clear 503) when
// ANTHROPIC_API_KEY isn't configured yet, instead of failing opaquely.
let anthropic = null;
function getAnthropicClient() {
  if (!config.anthropic.apiKey) return null;
  if (!anthropic) anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });
  return anthropic;
}

const COMPLIANCE_SYSTEM_PROMPT = `You are the Praeto Compliance Advisor — an expert South African financial services compliance assistant embedded in the Praeto Compliance Club membership platform, operated by Berkeley Pretorius (FSP 1457, RE1 Key Individual, RE5, Registered Assessor, Registered Moderator, SDF, NCRDC).

Your knowledge covers:
- FAIS Act (Financial Advisory and Intermediary Services Act 37 of 2002) and all amendments
- FSCA (Financial Sector Conduct Authority) regulatory frameworks, board notices, and guidance notes
- FIC Act (Financial Intelligence Centre Act) — AML/CFT obligations for accountable institutions
- PPR (Policyholder Protection Rules) including June 2026 Section 8 replacement disclosure amendments
- FAIS General Code of Conduct for Authorised Financial Services Providers
- INSETA's RE1 and RE5 examination requirements including the 2026 scenario-based format changes
- FSB/FSCA enforcement actions and sanction case law
- TETA and QCTO CPD requirements (30 hours per annum)
- Fit and Proper requirements for FSPs and representatives
- FSCA Category I, II, III FSP licence categories
- NCA (National Credit Act) and NCR requirements
- Microinsurance Act provisions relevant to cell captive products
- Key Individual (KI) supervision and oversight obligations

IMPORTANT RULES:
1. Only answer questions about South African financial services compliance, regulation, and related practice management topics
2. If asked something outside this domain, politely redirect to compliance topics
3. Always cite the specific legislation, regulation, or guidance note when giving regulatory advice
4. Clarify that your responses are informational and members should consult the actual legislation for definitive guidance
5. When referencing FSCA guidance, note if it may have been updated since your knowledge cutoff
6. Be practical and actionable — give step-by-step guidance where possible
7. Refer members to the template library for documents mentioned in responses
8. Keep responses concise but thorough — this is a professional membership platform

ADVICE BOUNDARY (critical — do not breach):
- You provide general regulatory information and educational guidance ONLY. You do NOT provide financial advice as defined in the FAIS Act, nor formal legal advice.
- You must NOT recommend specific financial products, investments, or transactions to end clients, nor tell a member what advice to give their own clients.
- For any high-stakes or fact-specific matter (an enforcement action, a licence application, a specific client complaint, a debarment), state plainly that the member should confirm the position against the current legislation and, where appropriate, obtain advice from a qualified compliance officer or attorney.
- Never state or imply that following your guidance guarantees regulatory compliance. Compliance responsibility remains with the member and their FSP's Key Individual.`;

// ─── POST /api/ai/chat ────────────────────────────────────────────────────────
router.post('/chat', requireAuth, async (req, res) => {
  const { message, conversation_id } = req.body;

  const client = getAnthropicClient();
  if (!client) {
    return res.status(503).json({
      error: 'The AI Compliance Advisor is not activated yet. It will be available shortly — please check back soon.',
    });
  }

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ error: 'Message is required.' });
  }

  if (message.length > 4000) {
    return res.status(400).json({ error: 'Message too long (max 4000 characters).' });
  }

  try {
    // Load or create conversation
    let conversation = null;
    let messages = [];

    if (conversation_id) {
      const { rows } = await db.query(
        'SELECT id, messages FROM ai_conversations WHERE id = $1 AND member_id = $2',
        [conversation_id, req.member.id]
      );
      if (rows.length) {
        conversation = rows[0];
        messages = rows[0].messages;
      }
    }

    if (!conversation) {
      const { rows: [conv] } = await db.query(
        "INSERT INTO ai_conversations (member_id, messages) VALUES ($1, '[]') RETURNING id, messages",
        [req.member.id]
      );
      conversation = conv;
      messages = [];
    }

    // Add user message to history
    messages.push({ role: 'user', content: message.trim() });

    // Keep last 20 messages (10 turns) to manage context window
    const contextMessages = messages.slice(-20);

    // Call Anthropic.
    // Prompt caching: cache the stable prefix (system prompt + prior conversation) so its
    // tokens bill at ~0.1x instead of full price on every follow-up message. Top-level
    // cache_control auto-places the breakpoint on the last cacheable block, so the system
    // prompt + growing history is cached and reused as the member goes back and forth.
    // On claude-sonnet-4-6 the cacheable-prefix floor is 2048 tokens, so the saving kicks
    // in once system + a couple of turns clear that (confirm via cache_read_input_tokens
    // in the usage payload below). Default 5-minute TTL keeps a live conversation warm.
    const response = await client.messages.create({
      model: config.anthropic.model,
      max_tokens: 1500,
      cache_control: { type: 'ephemeral' },
      system: COMPLIANCE_SYSTEM_PROMPT,
      messages: contextMessages.map(m => ({
        role: m.role,
        content: m.content,
      })),
    });

    const assistantMessage = response.content[0].text;

    // Add assistant response to history
    messages.push({ role: 'assistant', content: assistantMessage });

    // Save updated conversation
    await db.query(
      'UPDATE ai_conversations SET messages = $1, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(messages), conversation.id]
    );

    res.json({
      reply: assistantMessage,
      conversation_id: conversation.id,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        // Surfaced so the caching win is observable, not assumed: a non-zero
        // cache_read on follow-up messages = the stable prefix is being reused.
        cache_read_input_tokens: response.usage.cache_read_input_tokens,
        cache_creation_input_tokens: response.usage.cache_creation_input_tokens,
      },
    });
  } catch (err) {
    console.error('AI chat error:', err);
    if (err?.status === 429) {
      return res.status(429).json({ error: 'AI service is currently busy. Please try again in a moment.' });
    }
    res.status(500).json({ error: 'AI Advisor is temporarily unavailable. Please try again.' });
  }
});

// ─── GET /api/ai/conversations ────────────────────────────────────────────────
router.get('/conversations', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, created_at, updated_at,
              messages->0->>'content' AS first_message
       FROM ai_conversations
       WHERE member_id = $1
       ORDER BY updated_at DESC
       LIMIT 20`,
      [req.member.id]
    );
    res.json({ conversations: rows });
  } catch (err) {
    console.error('AI conversations error:', err);
    res.status(500).json({ error: 'Failed to fetch conversations.' });
  }
});

// ─── GET /api/ai/conversations/:id ───────────────────────────────────────────
router.get('/conversations/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT id, messages, created_at FROM ai_conversations WHERE id = $1 AND member_id = $2',
      [req.params.id, req.member.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Conversation not found.' });
    res.json(rows[0]);
  } catch (err) {
    console.error('AI conversation fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch conversation.' });
  }
});

// ─── DELETE /api/ai/conversations/:id ────────────────────────────────────────
router.delete('/conversations/:id', requireAuth, async (req, res) => {
  try {
    await db.query(
      'DELETE FROM ai_conversations WHERE id = $1 AND member_id = $2',
      [req.params.id, req.member.id]
    );
    res.json({ message: 'Conversation deleted.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete conversation.' });
  }
});

module.exports = router;
