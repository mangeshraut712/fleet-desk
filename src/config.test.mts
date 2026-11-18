import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isAllowlistedRepo, getOrganizationForRepo } from './config.ts'

test('isAllowlistedRepo identifies allowlisted company slugs', () => {
  assert.equal(isAllowlistedRepo('apple/swift'), true)
  assert.equal(isAllowlistedRepo('meta/react'), true)
  assert.equal(isAllowlistedRepo('facebook/react-native'), true)
  assert.equal(isAllowlistedRepo('awslabs/stickler'), true)
  assert.equal(isAllowlistedRepo('amazon/amazon-chime-sdk'), true)
  assert.equal(isAllowlistedRepo('microsoft/vscode'), true)
  assert.equal(isAllowlistedRepo('spacex/launch'), true)
  assert.equal(isAllowlistedRepo('xai-org/grok'), true)
  assert.equal(isAllowlistedRepo('salesforce/zana'), true)
  assert.equal(isAllowlistedRepo('google/adk-go'), true)
  assert.equal(isAllowlistedRepo('google-gemini/cookbook'), true)
  assert.equal(isAllowlistedRepo('intel/dokimi'), true)
  assert.equal(isAllowlistedRepo('ibm/javacore-analyser'), true)
  assert.equal(isAllowlistedRepo('carbon-design-system/carbon'), true)
})

test('isAllowlistedRepo handles casing and whitespace', () => {
  assert.equal(isAllowlistedRepo('  APPLE/swift  '), true)
  assert.equal(isAllowlistedRepo('Meta/React'), true)
})

test('isAllowlistedRepo rejects non-allowlisted or malformed repos', () => {
  assert.equal(isAllowlistedRepo('unaffiliated/repo'), false)
  assert.equal(isAllowlistedRepo(''), false)
  assert.equal(isAllowlistedRepo(null), false)
  assert.equal(isAllowlistedRepo(undefined), false)
})

test('getOrganizationForRepo returns canonical organization name', () => {
  assert.equal(getOrganizationForRepo('apple/pkl'), 'Apple')
  assert.equal(getOrganizationForRepo('meta/react'), 'Meta')
  assert.equal(getOrganizationForRepo('facebook/react-native'), 'Meta')
  assert.equal(getOrganizationForRepo('awslabs/stickler'), 'Amazon / AWS')
  assert.equal(getOrganizationForRepo('spacex/api'), 'SpaceX / xAI')
  assert.equal(getOrganizationForRepo('xai-org/prompt'), 'SpaceX / xAI')
  assert.equal(getOrganizationForRepo('salesforce/zana'), 'Salesforce')
  assert.equal(getOrganizationForRepo('google/adk-go'), 'Google')
  assert.equal(getOrganizationForRepo('google-gemini/cookbook'), 'Google')
  assert.equal(getOrganizationForRepo('intel/dokimi'), 'Intel')
  assert.equal(getOrganizationForRepo('ibm/javacore-analyser'), 'IBM')
  assert.equal(getOrganizationForRepo('carbon-design-system/carbon'), 'IBM')
  assert.equal(getOrganizationForRepo('unknown/project'), null)
  assert.equal(getOrganizationForRepo(null), null)
  assert.equal(getOrganizationForRepo(''), null)
})
