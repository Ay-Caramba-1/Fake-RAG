import { eventSource, event_types } from '../../../../script.js';
import { renderExtensionTemplateAsync } from '../../../extensions.js';
import { getStringHash } from '../../../utils.js';
import { SECRET_KEYS, secret_state } from '../../../secrets.js';

export { MODULE_NAME };

const MODULE_NAME = 'fake-rag';
const SOURCE_ID = 'fakerag';
const TEMPLATE_PATH = 'third-party/Extension-FakeRAG';
const GROQ_MODELS_ENDPOINT = 'https://api.groq.com/openai/v1/models';

const fileStorage = new Map();

const defaultSettings = Object.freeze({
    groqModel: 'llama-3.1-8b-instant',
    groqApiKey: '',
    keywordPrompt: `You are extracting keywords to help a roleplay character remember past events.
Extract 3-5 important keywords from the text that would help recall relevant memories.

Focus on:
- Character names and nicknames
- Places, locations, kingdoms
- Important objects (gifts, weapons, artifacts)
- Emotions and relationships (love, betrayal, friendship)
- Significant events (promises, secrets, confessions)
- Unique terms or phrases that were memorable

Respond ONLY with keywords separated by commas, nothing else.
Example: Elena, crystal pendant, forbidden love, tower, promise

Text:`,
    contextPadding: 1200,
    maxResults: 5,
    minKeywordLength: 2,
    maxKeywordLength: 30,
    maxInjectionChars: 75000,
    autoClearOnChatChange: true,
});

function getSettings() {
    const { extensionSettings } = SillyTavern.getContext();
    if (!extensionSettings[MODULE_NAME]) {
        extensionSettings[MODULE_NAME] = structuredClone(defaultSettings);
    }
    for (const key of Object.keys(defaultSettings)) {
        if (!Object.hasOwn(extensionSettings[MODULE_NAME], key)) {
            extensionSettings[MODULE_NAME][key] = defaultSettings[key];
        }
    }
    return extensionSettings[MODULE_NAME];
}

async function fetchGroqModels() {
    const settings = getSettings();
    const apiKey = settings.groqApiKey?.trim();

    if (apiKey) {
        const response = await fetch(GROQ_MODELS_ENDPOINT, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
        });
        if (!response.ok) throw new Error(`Groq API error: ${response.status}`);
        const data = await response.json();
        return data.data || [];
    }

    if (secret_state[SECRET_KEYS.GROQ]) {
        const { getRequestHeaders } = SillyTavern.getContext();
        const response = await fetch('/api/backends/chat-completions/status', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ chat_completion_source: 'groq' }),
        });
        if (response.ok) {
            const data = await response.json();
            return data.models || data.data || [];
        }
    }

    throw new Error('No Groq API key configured.');
}

async function extractKeywordsWithGroq(text) {
    const settings = getSettings();
    const apiKey = settings.groqApiKey?.trim();
    const truncatedText = text.substring(0, 2000);

    console.log(`[FakeRAG] Extracting keywords from ${truncatedText.length} chars`);

    if (apiKey) {
        try {
            const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: settings.groqModel || 'llama-3.1-8b-instant',
                    messages: [
                        { role: 'system', content: settings.keywordPrompt },
                        { role: 'user', content: truncatedText },
                    ],
                    temperature: 0.1,
                    max_tokens: 100,
                }),
            });

            if (!response.ok) throw new Error(`Groq API error: ${response.status}`);
            const data = await response.json();
            const keywordsText = data.choices?.[0]?.message?.content || '';
            return parseKeywords(keywordsText, settings);
        } catch (error) {
            console.error('[FakeRAG] Direct Groq failed:', error);
            return extractSimpleKeywords(text);
        }
    }

    if (!secret_state[SECRET_KEYS.GROQ]) {
        return extractSimpleKeywords(text);
    }

    try {
        const { getRequestHeaders } = SillyTavern.getContext();
        const response = await fetch('/api/backends/chat-completions/generate', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({
                messages: [
                    { role: 'system', content: settings.keywordPrompt },
                    { role: 'user', content: truncatedText },
                ],
                model: settings.groqModel,
                chat_completion_source: 'groq',
                temperature: 0.1,
                max_tokens: 100,
                stream: false,
            }),
        });

        if (!response.ok) throw new Error(`ST backend failed: ${response.status}`);
        const data = await response.json();
        const keywordsText = data.choices?.[0]?.message?.content || '';
        return parseKeywords(keywordsText, settings);
    } catch (error) {
        console.error('[FakeRAG] ST backend failed:', error);
        return extractSimpleKeywords(text);
    }
}

function parseKeywords(keywordsText, settings) {
    return keywordsText
        .split(',')
        .map(k => k.trim().toLowerCase())
        .filter(k =>
            k.length >= settings.minKeywordLength &&
            k.length <= settings.maxKeywordLength &&
            !k.includes('\n')
        );
}

function extractSimpleKeywords(text) {
    const stopWords = new Set([
        'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
        'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
        'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as',
        'and', 'but', 'if', 'or', 'because', 'until', 'while', 'this', 'that',
        'el', 'la', 'los', 'las', 'un', 'una', 'de', 'del', 'al', 'y', 'o',
        'que', 'en', 'es', 'son', 'como', 'para', 'por', 'con', 'sin',
    ]);

    const words = text
        .toLowerCase()
        .replace(/[^\w\sáéíóúñüàèìòùâêîôûäëïöü]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 3 && w.length < 20 && !stopWords.has(w) && !/^\d+$/.test(w));

    return [...new Set(words)].slice(0, 5);
}

function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function searchLiteral(query, contextPadding = 1200, targetCollectionId = null) {
    const results = [];
    const escapedQuery = escapeRegex(query);
    let pattern;
    try {
        pattern = new RegExp(`\\b${escapedQuery}\\b`, 'gi');
    } catch (e) {
        return results;
    }

    for (const [collectionId, data] of fileStorage) {
        if (targetCollectionId && collectionId !== targetCollectionId) continue;

        const content = data.fileText;
        const coveredRanges = [];

        let match;
        while ((match = pattern.exec(content)) !== null) {
            const idx = match.index;
            const isCovered = coveredRanges.some(([start, end]) => idx >= start && idx < end);
            if (isCovered) continue;

            const fragStart = Math.max(0, idx - contextPadding);
            const fragEnd = Math.min(content.length, match.index + match[0].length + contextPadding);
            coveredRanges.push([fragStart, fragEnd]);

            let fragment = content.substring(fragStart, fragEnd);
            fragment = fragment.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();

            const prefix = fragStart > 0 ? '...' : '';
            const suffix = fragEnd < content.length ? '...' : '';

            results.push({
                collectionId,
                fileName: data.fileName,
                text: prefix + fragment + suffix,
                index: idx,
                hash: getStringHash(fragment),
                query,
            });
        }
    }

    return results;
}

function searchMultipleKeywords(keywords, contextPadding, maxResults, targetCollectionId = null) {
    let allResults = [];
    for (const keyword of keywords) {
        const results = searchLiteral(keyword, contextPadding, targetCollectionId);
        allResults.push(...results);
    }

    const seen = new Set();
    const uniqueResults = allResults.filter(r => {
        const key = `${r.collectionId}-${r.index}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    uniqueResults.sort((a, b) => {
        const aMatches = keywords.filter(k => a.text.toLowerCase().includes(k.toLowerCase())).length;
        const bMatches = keywords.filter(k => b.text.toLowerCase().includes(k.toLowerCase())).length;
        return bMatches - aMatches;
    });

    return uniqueResults.slice(0, maxResults);
}

function truncateResultsToLimit(results, maxChars) {
    const truncatedResults = [];
    let totalChars = 0;

    for (const result of results) {
        if (totalChars + result.text.length <= maxChars) {
            truncatedResults.push(result);
            totalChars += result.text.length;
        } else {
            const remainingChars = maxChars - totalChars;
            if (remainingChars > 100) {
                const truncatedResult = {
                    ...result,
                    text: result.text.substring(0, remainingChars) + '...[truncated]',
                };
                truncatedResults.push(truncatedResult);
            }
            break;
        }
    }

    console.log(`[FakeRAG] Truncated ${results.length} results to ${truncatedResults.length} (${totalChars} chars, limit: ${maxChars})`);
    return truncatedResults;
}

function fakeInsertItems(collectionId, items, fileName = 'unknown') {
    const combinedText = items.map(i => i.text).join('\n\n');
    fileStorage.set(collectionId, {
        fileName,
        fileText: combinedText,
        timestamp: Date.now(),
    });
    console.log(`[FakeRAG] Stored collection "${collectionId}" (${combinedText.length} chars)`);
    updateStatusDisplay();
}

async function fakeQueryCollection(collectionId, searchText, topK) {
    const settings = getSettings();

    console.log(`[FakeRAG] Query: collection=${collectionId}, topK=${topK}`);

    if (!fileStorage.has(collectionId)) {
        return { hashes: [], metadata: [] };
    }

    const keywords = await extractKeywordsWithGroq(searchText);
    console.log(`[FakeRAG] Keywords: ${keywords.join(', ')}`);

    if (!keywords.length) {
        return { hashes: [], metadata: [] };
    }

    let results = searchMultipleKeywords(keywords, settings.contextPadding, topK, collectionId);
    results = truncateResultsToLimit(results, settings.maxInjectionChars);

    console.log(`[FakeRAG] Found ${results.length} results`);

    return {
        hashes: results.map(r => r.hash),
        metadata: results.map(r => ({ text: r.text, index: r.index, hash: r.hash })),
    };
}

async function fakeQueryMultipleCollections(collectionIds, searchText, topK) {
    console.log(`[FakeRAG] Multi-query: ${collectionIds.length} collections`);

    const settings = getSettings();
    const keywords = await extractKeywordsWithGroq(searchText);
    console.log(`[FakeRAG] Keywords: ${keywords.join(', ')}`);

    if (!keywords.length) {
        const results = {};
        for (const cid of collectionIds) {
            results[cid] = { hashes: [], metadata: [] };
        }
        return results;
    }

    const results = {};
    let totalCharsUsed = 0;
    const maxChars = settings.maxInjectionChars;

    for (const collectionId of collectionIds) {
        if (!fileStorage.has(collectionId)) {
            results[collectionId] = { hashes: [], metadata: [] };
            continue;
        }

        let searchResults = searchMultipleKeywords(keywords, settings.contextPadding, topK, collectionId);

        const remainingChars = maxChars - totalCharsUsed;
        if (remainingChars <= 0) {
            results[collectionId] = { hashes: [], metadata: [] };
            continue;
        }

        searchResults = truncateResultsToLimit(searchResults, remainingChars);
        totalCharsUsed += searchResults.reduce((sum, r) => sum + r.text.length, 0);

        results[collectionId] = {
            hashes: searchResults.map(r => r.hash),
            metadata: searchResults.map(r => ({ text: r.text, index: r.index, hash: r.hash })),
        };
    }

    console.log(`[FakeRAG] Total injection: ${totalCharsUsed} chars (limit: ${maxChars})`);
    return results;
}

function fakeListHashes(collectionId) {
    const data = fileStorage.get(collectionId);
    if (!data) return [];
    return [getStringHash(data.fileText)];
}

function fakeDeleteCollection(collectionId) {
    fileStorage.delete(collectionId);
    updateStatusDisplay();
}

function fakePurgeAll() {
    fileStorage.clear();
    console.log('[FakeRAG] Purged all collections');
    updateStatusDisplay();
}

function onChatChanged() {
    const settings = getSettings();
    if (settings.autoClearOnChatChange) {
        console.log('[FakeRAG] Chat changed, auto-clearing cache...');
        fakePurgeAll();
        toastr.info('FakeRAG cache cleared (chat changed)', 'FakeRAG');
    }
}

let originalFetch = null;

function installFetchHooks() {
    if (originalFetch) return;

    originalFetch = window.fetch;

    window.fetch = async function (url, options) {
        if (typeof url === 'string' && url.includes('/api/vector/')) {
            try {
                const body = JSON.parse(options?.body || '{}');

                if (body.source === SOURCE_ID) {
                    console.log(`[FakeRAG] Intercepting: ${url}`);

                    if (url.includes('/insert')) {
                        fakeInsertItems(body.collectionId, body.items || [], body.collectionId);
                        return new Response(JSON.stringify({ ok: true }), {
                            status: 200, headers: { 'Content-Type': 'application/json' },
                        });
                    }

                    if (url.includes('/query-multi')) {
                        const results = await fakeQueryMultipleCollections(
                            body.collectionIds || [],
                            body.searchText || '',
                            body.topK || 10
                        );
                        return new Response(JSON.stringify(results), {
                            status: 200, headers: { 'Content-Type': 'application/json' },
                        });
                    }

                    if (url.includes('/query') && !url.includes('/query-multi')) {
                        const result = await fakeQueryCollection(
                            body.collectionId || '',
                            body.searchText || '',
                            body.topK || 10
                        );
                        return new Response(JSON.stringify(result), {
                            status: 200, headers: { 'Content-Type': 'application/json' },
                        });
                    }

                    if (url.includes('/list')) {
                        const hashes = fakeListHashes(body.collectionId);
                        return new Response(JSON.stringify(hashes), {
                            status: 200, headers: { 'Content-Type': 'application/json' },
                        });
                    }

                    if (url.includes('/purge-all')) {
                        fakePurgeAll();
                        return new Response('', { status: 200 });
                    }

                    if (url.includes('/delete') || url.includes('/purge')) {
                        if (body.collectionId) fakeDeleteCollection(body.collectionId);
                        return new Response('', { status: 200 });
                    }
                }
            } catch (e) {
                console.error('[FakeRAG] Hook error:', e);
            }
        }
        return originalFetch.apply(this, arguments);
    };

    console.log('[FakeRAG] Fetch hooks installed');
}

function updateStatusDisplay() {
    const count = fileStorage.size;
    let totalChars = 0;
    fileStorage.forEach(data => { totalChars += data.fileText.length; });

    const statusText = count === 0
        ? 'No files loaded'
        : `${count} file(s) loaded (${(totalChars / 1024).toFixed(1)} KB total)`;

    $('#fakerag_status_text').text(statusText);
}

function updateConnectionStatus(connected, message, modelCount = 0) {
    $('#fakerag_connection_status').show();
    if (connected) {
        $('#fakerag_connection_icon').removeClass('fakerag-disconnected').addClass('fakerag-connected');
        $('#fakerag_connection_text').text(`Connected - ${modelCount} models available`);
    } else {
        $('#fakerag_connection_icon').removeClass('fakerag-connected').addClass('fakerag-disconnected');
        $('#fakerag_connection_text').text(message || 'Not connected');
    }
}

function injectVectorSourceOption() {
    const vectorsSelect = $('#vectors_source');
    if (vectorsSelect.length === 0) return false;

    if ($(`#vectors_source option[value="${SOURCE_ID}"]`).length === 0) {
        vectorsSelect.append(`<option value="${SOURCE_ID}">🔍 FakeRAG (Keyword Search)</option>`);
        console.log('[FakeRAG] Injected source option');
    }
    return true;
}

function populateModelDropdown(models) {
    const $select = $('#fakerag_groq_model');
    const settings = getSettings();
    const currentModel = settings.groqModel;

    $select.empty();

    if (!models || models.length === 0) {
        $select.append('<option value="">-- No models found --</option>');
        return;
    }

    models.forEach(model => {
        const id = model.id || model;
        $select.append(`<option value="${id}">${id}</option>`);
    });

    if (currentModel && $select.find(`option[value="${currentModel}"]`).length > 0) {
        $select.val(currentModel);
    } else if (models.length > 0) {
        $select.val(models[0].id || models[0]);
        settings.groqModel = models[0].id || models[0];
        SillyTavern.getContext().saveSettingsDebounced();
    }
}

jQuery(async function () {
    console.log('[FakeRAG] Initializing...');

    const settingsHtml = await renderExtensionTemplateAsync(TEMPLATE_PATH, 'settings');
    const container = $(document.getElementById('fakerag_container') ?? document.getElementById('extensions_settings2'));
    container.append(settingsHtml);

    const settings = getSettings();
    $('#fakerag_api_key').val(settings.groqApiKey || '');
    $('#fakerag_context_padding').val(settings.contextPadding);
    $('#fakerag_max_results').val(settings.maxResults);
    $('#fakerag_min_keyword_length').val(settings.minKeywordLength);
    $('#fakerag_max_keyword_length').val(settings.maxKeywordLength);
    $('#fakerag_keyword_prompt').val(settings.keywordPrompt);
    $('#fakerag_max_injection_chars').val(settings.maxInjectionChars);
    $('#fakerag_auto_clear_on_chat_change').prop('checked', settings.autoClearOnChatChange);

    if (settings.groqModel) {
        $('#fakerag_groq_model').empty().append(`<option value="${settings.groqModel}">${settings.groqModel}</option>`);
        $('#fakerag_groq_model').val(settings.groqModel);
    }

    $('#fakerag_api_key').on('input', function () {
        settings.groqApiKey = $(this).val();
        SillyTavern.getContext().saveSettingsDebounced();
    });

    $('#fakerag_toggle_key_visibility').on('click', function () {
        const $input = $('#fakerag_api_key');
        if ($input.attr('type') === 'password') {
            $input.attr('type', 'text');
            $(this).removeClass('fa-eye').addClass('fa-eye-slash');
        } else {
            $input.attr('type', 'password');
            $(this).removeClass('fa-eye-slash').addClass('fa-eye');
        }
    });

    $('#fakerag_connect_groq').on('click', async function () {
        const $button = $(this);
        const $icon = $button.find('i');

        $button.addClass('disabled');
        $icon.removeClass('fa-plug').addClass('fa-spinner fa-spin');

        try {
            const models = await fetchGroqModels();
            populateModelDropdown(models);
            updateConnectionStatus(true, null, models.length);
            toastr.success(`Loaded ${models.length} models`, 'FakeRAG');
        } catch (error) {
            updateConnectionStatus(false, error.message);
            toastr.error(error.message, 'FakeRAG');
        } finally {
            $button.removeClass('disabled');
            $icon.removeClass('fa-spinner fa-spin').addClass('fa-plug');
        }
    });

    $('#fakerag_groq_model').on('change', function () {
        settings.groqModel = $(this).val();
        SillyTavern.getContext().saveSettingsDebounced();
    });

    $('#fakerag_context_padding').on('input', function () {
        settings.contextPadding = parseInt($(this).val()) || 1200;
        SillyTavern.getContext().saveSettingsDebounced();
    });

    $('#fakerag_max_results').on('input', function () {
        settings.maxResults = parseInt($(this).val()) || 5;
        SillyTavern.getContext().saveSettingsDebounced();
    });

    $('#fakerag_min_keyword_length').on('input', function () {
        settings.minKeywordLength = parseInt($(this).val()) || 2;
        SillyTavern.getContext().saveSettingsDebounced();
    });

    $('#fakerag_max_keyword_length').on('input', function () {
        settings.maxKeywordLength = parseInt($(this).val()) || 30;
        SillyTavern.getContext().saveSettingsDebounced();
    });

    $('#fakerag_keyword_prompt').on('change', function () {
        settings.keywordPrompt = $(this).val();
        SillyTavern.getContext().saveSettingsDebounced();
    });

    $('#fakerag_max_injection_chars').on('input', function () {
        settings.maxInjectionChars = parseInt($(this).val()) || 75000;
        SillyTavern.getContext().saveSettingsDebounced();
    });

    $('#fakerag_auto_clear_on_chat_change').on('change', function () {
        settings.autoClearOnChatChange = $(this).prop('checked');
        SillyTavern.getContext().saveSettingsDebounced();
    });

    $('#fakerag_test_extraction').on('click', async function () {
        const testText = 'The princess secretly loved the knight, but their forbidden romance was threatened by the dark wizard.';
        $(this).addClass('fakerag-processing');
        try {
            const keywords = await extractKeywordsWithGroq(testText);
            toastr.info(`Keywords: ${keywords.join(', ')}`, 'FakeRAG Test');
        } catch (e) {
            toastr.error('Failed: ' + e.message, 'FakeRAG');
        }
        $(this).removeClass('fakerag-processing');
    });

    $('#fakerag_clear_cache').on('click', function () {
        fakePurgeAll();
        toastr.success('Cache cleared', 'FakeRAG');
    });

    eventSource.on(event_types.CHAT_CHANGED, onChatChanged);

    if (!injectVectorSourceOption()) {
        setTimeout(injectVectorSourceOption, 2000);
        setTimeout(injectVectorSourceOption, 5000);
    }

    installFetchHooks();
    updateStatusDisplay();

    console.log('[FakeRAG] Initialized!');
});

window.FakeRAG = {
    extractKeywords: extractKeywordsWithGroq,
    searchLiteral,
    fileStorage,
    getSettings,
    clearCache: fakePurgeAll,
};
