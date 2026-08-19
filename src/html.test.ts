import { describe, expect, it } from 'vitest'
import { escapeHtml } from './html.ts'

describe('escapeHtml', () => {
  it('escapes the five HTML-sensitive characters', () => {
    expect(escapeHtml(`<script>alert("x'&")</script>`)).toBe(
      '&lt;script&gt;alert(&quot;x&#39;&amp;&quot;)&lt;/script&gt;',
    )
  })

  it('passes plain text through unchanged', () => {
    expect(escapeHtml('median of empty list returns NaN')).toBe(
      'median of empty list returns NaN',
    )
  })

  it('handles empty string and non-ASCII (Chinese) safely', () => {
    expect(escapeHtml('')).toBe('')
    expect(escapeHtml('修复 median() 对空数组的处理')).toBe(
      '修复 median() 对空数组的处理',
    )
  })
})
