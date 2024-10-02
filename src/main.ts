import * as core from '@actions/core'
import * as github from '@actions/github'
import { readFileSync } from 'fs'
import * as path from 'path'
import { Endpoints } from '@octokit/types'
import { Octokit } from '@octokit/action'

type Ruleset =
  Endpoints['GET /orgs/{org}/rulesets/{ruleset_id}']['response']['data']
type RulesetUpdate =
  Endpoints['PUT /orgs/{org}/rulesets/{ruleset_id}']['parameters']

async function validateRuleset(ruleset: Ruleset): Promise<boolean> {
  // Implement validation logic here
  if (ruleset === null) {
    return false
  }
  return true
}

async function fetchCurrentRuleset(
  octokit: Octokit,
  org: string,
  rulesetId: number
): Promise<Ruleset> {
  // https://docs.github.com/en/rest/orgs/rules?apiVersion=2022-11-28#get-an-organization-repository-ruleset
  const response = await octokit.request(
    'GET /orgs/{org}/rulesets/{ruleset_id}',
    {
      org,
      ruleset_id: rulesetId
    }
  )

  if (response.status !== 200) {
    throw new Error(`Failed to fetch the current ruleset: ${response.status}`)
  }

  return response.data
}

// Type guard for repository_name condition
function hasRepositoryNameCondition(
  conditions: any
): conditions is { repository_name: any } {
  return conditions && conditions.repository_name !== undefined
}

// Type guard for repository_id condition
function hasRepositoryIdCondition(
  conditions: any
): conditions is { repository_id: any } {
  return conditions && conditions.repository_id !== undefined
}

// Type guard for repository_property condition
function hasRepositoryPropertyCondition(
  conditions: any
): conditions is { repository_property: any } {
  return conditions && conditions.repository_property !== undefined
}

async function updateRuleset(
  octokit: Octokit,
  org: string,
  rulesetId: number,
  ruleset: Ruleset
): Promise<void> {
  // An odd fix for a Type issue:
  // Define default conditions with all required properties
  // and merge default conditions with the ruleset conditions
  // Dynamically build conditions only if they exist in ruleset.conditions
  // Initialize conditions object based on ruleset.conditions
  const conditions: any = {}

  // Dynamically check and assign conditions based on type
  if (ruleset.conditions) {
    if (ruleset.conditions.ref_name) {
      conditions.ref_name = ruleset.conditions.ref_name
    }

    if (hasRepositoryNameCondition(ruleset.conditions)) {
      conditions.repository_name = ruleset.conditions.repository_name
    }

    if (hasRepositoryIdCondition(ruleset.conditions)) {
      conditions.repository_id = ruleset.conditions.repository_id
    }

    if (hasRepositoryPropertyCondition(ruleset.conditions)) {
      conditions.repository_property = ruleset.conditions.repository_property
    }
  }

  // Ensure valid condition structure (no conflicting conditions, e.g., repository_name and repository_id together)
  const hasRepositoryName = hasRepositoryNameCondition(conditions)
  const hasRepositoryId = hasRepositoryIdCondition(conditions)
  const hasRepositoryProperty = hasRepositoryPropertyCondition(conditions)

  if (
    (hasRepositoryName && hasRepositoryId) ||
    (hasRepositoryName && hasRepositoryProperty) ||
    (hasRepositoryId && hasRepositoryProperty)
  ) {
    throw new Error(
      'Only one condition type (repository_name, repository_id, or repository_property) is allowed at a time'
    )
  }

  // Create a new object that matches the expected type
  const updateParams: RulesetUpdate = {
    org,
    ruleset_id: rulesetId,
    name: ruleset.name,
    target: ruleset.target,
    enforcement: ruleset.enforcement,
    bypass_actors: ruleset.bypass_actors,
    conditions,
    rules: ruleset.rules
  }

  const response = await octokit.request(
    'PUT /orgs/{org}/rulesets/{ruleset_id}',
    updateParams
  )
  if (response.status !== 200) {
    throw new Error(`Failed to update the ruleset: ${response.status}`)
  }
}

/**
 * The main function for the action.
 * @returns {Promise<void>} Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    core.info(`✅ Reading input for the action`)
    const rulesetFilePath: string = core.getInput('ruleset-file-path')
    const token: string = core.getInput('token')
    core.setSecret(token)
    let org: string = core.getInput('organization')
    // if the org is empty then take the org from where the workflow is trigged
    if (org === '') {
      org = github.context.repo.owner
    }
    const octokit = new Octokit({ auth: token })

    core.info(`✅ Reading the ruleset file from the provided path`)
    // Read the ruleset file from the provided path
    const rulesetContent = readFileSync(path.resolve(rulesetFilePath), 'utf-8')
    const localRuleset: Ruleset = JSON.parse(rulesetContent)

    core.info(`✅ Validating the ruleset`)
    // Validate the ruleset
    // throw an error if the ruleset is invalid and fail the workflow
    if (!(await validateRuleset(localRuleset))) {
      core.setFailed('Invalid ruleset')
      throw new Error('Invalid ruleset')
    }

    core.info(`✅ Fetching the current ruleset from the REST API`)
    // Fetch the current ruleset from the REST API
    const rulesetId: number = localRuleset.id
    const currentRuleset: Ruleset = await fetchCurrentRuleset(
      octokit,
      org,
      rulesetId
    )

    core.info(
      `✅ Comparing the current organization ruleset with the proposed ruleset`
    )
    // Compare the two rulesets and update the ruleset if they are different
    if (JSON.stringify(localRuleset) !== JSON.stringify(currentRuleset)) {
      core.info(`✅ Updating the organization ruleset`)
      await updateRuleset(octokit, org, rulesetId, localRuleset)
    } else {
      core.info(`✅ The organization ruleset is up to date`)
    }

    core.info(`✅ Completed`)
  } catch (error) {
    // Fail the workflow run if an error occurs
    core.error(`🪲 Error has occurred -> ${error}`)
    if (error instanceof Error) core.setFailed(error.message)
  }
}
