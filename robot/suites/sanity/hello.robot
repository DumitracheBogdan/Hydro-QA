*** Settings ***
Documentation    Sanity suite - verifies Robot Framework runs.
...              Makes ZERO network calls. Reads no Hydrocert credentials.
Library    OperatingSystem

*** Test Cases ***
SAN01 Robot Framework Runs
    [Documentation]    Engine sanity: arithmetic + Log keyword.
    [Tags]    id:SAN01    area:sanity    safeOnProd
    Log    Robot Framework is alive
    Should Be Equal As Integers    ${1 + 1}    2

SAN02 Variables Resolve
    [Documentation]    Variable substitution + string assertion.
    [Tags]    id:SAN02    area:sanity    safeOnProd
    ${msg}=    Set Variable    hydrocert-robot-scaffold
    Should Contain    ${msg}    robot

SAN03 Environment Var Readable
    [Documentation]    Confirms CI env vars reach Robot (read-only - no fetch).
    [Tags]    id:SAN03    area:sanity    safeOnProd
    ${base}=    Get Environment Variable    HYDROCERT_API_BASE    default=${EMPTY}
    Log    HYDROCERT_API_BASE resolved to: ${base}
    Should Not Be Empty    ${base}
