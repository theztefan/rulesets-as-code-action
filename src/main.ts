import * as core from '@actions/core'
import * as github from '@actions/github'
import { readFileSync } from 'fs'
import * as path from 'path'
import { Endpoints } from '@octokit/types'
import { Octokit } from '@octokit/action'

async function validateRuleset(ruleset: Ruleset): Promise<Boolean> {
  // Implement your validation logic here
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

  return response.data
}
async function updateRuleset(
  octokit: Octokit,
  org: string,
  rulesetId: number,
  ruleset: Ruleset
): Promise<void> {
  // Define default conditions with all required properties
  const defaultConditions = {
    ref_name: { include: [], exclude: [] },
    repository_property: { include: [], exclude: [] }
  }

  // Merge default conditions with the ruleset conditions
  const conditions = { ...defaultConditions, ...ruleset.conditions }

  // Create a new object that matches the expected type
  const updateParams: RulesetUpdate = {
    org,
    ruleset_id: rulesetId,
    name: ruleset.name,
    target: ruleset.target,
    enforcement: ruleset.enforcement,
    bypass_actors: ruleset.bypass_actors,
    conditions: conditions,
    rules: ruleset.rules
  }

  // Update the ruleset using the new object
  await octokit.request('PUT /orgs/{org}/rulesets/{ruleset_id}', updateParams)
}

type Ruleset =
  Endpoints['GET /orgs/{org}/rulesets/{ruleset_id}']['response']['data']
type RulesetUpdate =
  Endpoints['PUT /orgs/{org}/rulesets/{ruleset_id}']['parameters']

/**
 * The main function for the action.
 * @returns {Promise<void>} Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    // Reading the changed rulset.json file from provided path)
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

    core.info(`✅ Comparing the current organization ruleset with the proposed ruleset`)
    // Compare the two rulesets and update the ruleset if they are different
    if (JSON.stringify(localRuleset) !== JSON.stringify(currentRuleset)) {
      core.info(`✅ Updating the organization ruleset`)
      await updateRuleset(octokit, org, rulesetId, localRuleset)
    }

    core.info(`✅ Compleded`)
  } catch (error) {
    // Fail the workflow run if an error occurs
    core.error(`🪲 Error has occurred: ${error}`)
    if (error instanceof Error) core.setFailed(error.message)
  }
}
