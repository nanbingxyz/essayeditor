import {describe, expect, it, vi} from 'vitest'

import type {ChatMessage, OpenAiCompatibleClient} from './openai-client'
import {
    analyzeWriting,
    createAnalysisChunks,
    extractJsonPayload,
    parseAnalysisResponse,
} from './writing-analyzer'

describe('writing analyzer response parsing', () => {
    it('extracts JSON from fenced or surrounding provider text', () => {
        expect(
            extractJsonPayload('结果如下：```json\n{"issues":[]}\n```谢谢')
        ).toEqual({issues: []})
        expect(
            extractJsonPayload('分析完成。{"issues":[]}以上。')
        ).toEqual({issues: []})
    })

    it('accepts exact high-confidence issues and normalizes style copy', () => {
        const issues = parseAnalysisResponse(
            JSON.stringify({
                issues: [
                    {
                        start: 0,
                        end: 4,
                        quote: '免费赠送',
                        category: '4.4',
                        severity: 'style',
                        message: '语义重复',
                        confidence: 0.96,
                    },
                    {
                        start: 5,
                        end: 9,
                        quote: '安祥离世',
                        category: '1.1',
                        severity: 'hard',
                        message: '同音字误用',
                        suggestion: '“安祥”应该是“安详”',
                        confidence: 0.99,
                    },
                ],
            }),
            {
                from: 10,
                id: 'chunk-0',
                text: '免费赠送 安祥离世',
            }
        )

        expect(issues).toMatchObject([
            {
                from: 10,
                to: 14,
                severity: 'style',
                message: '这里或许存在语义重复',
            },
            {
                from: 15,
                to: 19,
                severity: 'hard',
                suggestion: '“安祥”应该是“安详”',
            },
        ])
    })

    it('rejects low confidence, wrong severity, and style rewrites', () => {
        const issues = parseAnalysisResponse(
            JSON.stringify({
                issues: [
                    {
                        start: 0,
                        end: 2,
                        quote: '文本',
                        category: '1.1',
                        severity: 'style',
                        message: '错字',
                        confidence: 0.99,
                    },
                    {
                        start: 0,
                        end: 2,
                        quote: '文本',
                        category: '4.1',
                        severity: 'style',
                        message: '虚词',
                        suggestion: '改写',
                        confidence: 0.99,
                    },
                    {
                        start: 0,
                        end: 2,
                        quote: '文本',
                        category: '3.1',
                        severity: 'hard',
                        message: '矛盾',
                        suggestion: '应该修正',
                        confidence: 0.5,
                    },
                ],
            }),
            {from: 0, id: 'chunk-0', text: '文本'}
        )
        expect(issues).toEqual([])
    })

    it('uses a unique exact quote when provider offsets are unreliable', () => {
        const [issue] = parseAnalysisResponse(
            JSON.stringify({
                issues: [
                    {
                        start: 99,
                        end: 100,
                        quote: '目标',
                        category: '2.4',
                        severity: 'hard',
                        message: '搭配不当',
                        suggestion: '应该是其他表达',
                        confidence: 0.9,
                    },
                ],
            }),
            {from: 20, id: 'chunk-0', text: '唯一目标在这里'}
        )
        expect(issue).toMatchObject({from: 22, to: 24})
    })
})

describe('writing analyzer chunking', () => {
    it('keeps articles within 10000 characters in one chunk', () => {
        const content = '字'.repeat(10000)
        expect(createAnalysisChunks(content)).toHaveLength(1)
    })

    it('splits after 10000 characters', () => {
        const content = `${'甲'.repeat(10000)}${'乙'.repeat(10)}`
        const chunks = createAnalysisChunks(content)
        expect(chunks).toHaveLength(2)
        expect(chunks[0]?.text).toHaveLength(10000)
        expect(chunks[1]?.text).toBe('乙'.repeat(10))
    })

    it('sends stripped prose and maps findings back through markdown', async () => {
        let sentText = ''
        const complete = vi.fn(
            async (_config: unknown, messages: ChatMessage[]) => {
            sentText =
                messages.find((message) => message.role === 'user')
                    ?.content ?? ''
            return JSON.stringify({
                issues: [
                    {
                        start: 0,
                        end: 2,
                        quote: '安祥',
                        category: '1.1',
                        severity: 'hard',
                        message: '同音字误用',
                        suggestion: '“安祥”应该是“安详”',
                        confidence: 0.99,
                    },
                ],
            })
        }) satisfies OpenAiCompatibleClient['complete']
        const client: OpenAiCompatibleClient = {
            complete,
            listModels: vi.fn(async () => []),
            testConnection: vi.fn(async () => undefined),
        }
        const source = '看[安祥](https://example.com)离世'

        const issues = await analyzeWriting({
            client,
            config: {
                apiKey: 'key',
                baseUrl: 'https://example.com/v1',
                model: 'model',
            },
            content: source,
        })

        expect(JSON.parse(sentText)).toEqual({
            text: '看安祥离世',
        })
        expect(issues).toMatchObject([
            {
                from: source.indexOf('安祥'),
                quote: '安祥',
                to: source.indexOf('安祥') + 2,
            },
        ])
    })

    it('does not request analysis when markup leaves no prose', async () => {
        const complete = vi.fn(async () => '{"issues":[]}')
        await expect(
            analyzeWriting({
                client: {
                    complete,
                    listModels: vi.fn(async () => []),
                    testConnection: vi.fn(async () => undefined),
                },
                config: {
                    apiKey: 'key',
                    baseUrl: 'https://example.com/v1',
                    model: 'model',
                },
                content: '![示意图](https://example.com/a.png)\n[](https://example.com)',
            })
        ).resolves.toEqual([])
        expect(complete).not.toHaveBeenCalled()
    })

    it('analyzes chunks in parallel and reports progress after all complete', async () => {
        let inFlight = 0
        let maxInFlight = 0
        const complete = vi.fn(async () => {
            inFlight += 1
            maxInFlight = Math.max(maxInFlight, inFlight)
            await new Promise((resolve) => setTimeout(resolve, 20))
            inFlight -= 1
            return '{"issues":[]}'
        })
        const onProgress = vi.fn()

        await expect(
            analyzeWriting({
                client: {
                    complete,
                    listModels: vi.fn(async () => []),
                    testConnection: vi.fn(async () => undefined),
                },
                config: {
                    apiKey: 'key',
                    baseUrl: 'https://example.com/v1',
                    model: 'model',
                },
                content: `${'甲'.repeat(10000)}${'乙'.repeat(10)}`,
                onProgress,
            })
        ).resolves.toEqual([])
        expect(complete).toHaveBeenCalledTimes(2)
        expect(maxInFlight).toBe(2)
        expect(onProgress).toHaveBeenCalledWith(0, 2)
        expect(onProgress).toHaveBeenCalledWith(1, 2)
        expect(onProgress).toHaveBeenCalledWith(2, 2)
        expect(onProgress).toHaveBeenLastCalledWith(2, 2)
    })
})
