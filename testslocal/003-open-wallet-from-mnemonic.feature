Feature: Open Wallet from Seed
	As a visitor to the site,
	I should be able to open a wallet from seed.

Background:
	Given I am on the wallet site

@watch
Scenario: Visitor opens wallet from seed
	When I click Open Wallet
    And enter my mnemonic phrase "absorb filled perch retain tattoo likely snake photo rabbit editor shirt france exact angola style farce feels least zurich added gale risk hereby comedy yield pile mane signal camel stool depth throne torque orient"
    And click Unlock Wallet
    Then I should see "Unlocking wallet..." on the page
    And I should then see my wallet address "Q01050095b99edcc2eb80153f30475bdbff8737723f9c9072be60c74c82983548e4a5bcbaab216f" on the page