# Rulesets-as-Code Action

This is a GitHub Actions that allows you to manage your GitHub Rulesets via
code. It is a simple action that enables you to establish a workflow where a
ruleset definition is stored in a `json` file and any change to it needs to be
validated and approved by CODEOWNERS before it gets deployed as a change to the
Organization.

To update the organization the Action will use the available REST APIs:

- [Get an organization repository ruleset](https://docs.github.com/en/rest/orgs/rules?apiVersion=2022-11-28#get-an-organization-repository-ruleset)
- [Update an organization repository rules](https://docs.github.com/en/rest/orgs/rules?apiVersion=2022-11-28#update-an-organization-repository-ruleset)

## Inputs

- `ruleset-file-path`: Path to the local ruleset file.
- `token`: GitHub token for authentication.
- `organization`: GitHub organization name (optional).

## Usage

The idea is to run this action in a central Rulset governing reporsitory for
your organization. It can either be an existing repository where you manage
other policies or a dedicated new repository that you created for this purpose.

```yaml
name: Manage Organization Rulesets
on:
  push:
    branches: [main]
    paths: [ruleset.json]
jobs:
  ruleset-check:
    runs-on: ubuntu-latest
    permissions: read-all
    steps:
      - name: Checkout
        id: checkout
        uses: actions/checkout@v4

      - name: Generate App Token
        id: app-token
        uses: actions/create-github-app-token@v1
        with:
          app-id: ${{ secrets.APP_ID }}
          private-key: ${{ secrets.APP_KEY }}

      - name: Rulesets as Code
        id: rulesets-as-code
        uses: theztefan/rulesets-as-code-action@main
        with:
          ruleset-file-path: 'ruleset.json'
          token: ${{ steps.app-token.outputs.token }}
          organization: 'your-organization'
```
