Feature: Open Wallet from Seed
	As a visitor to the site,
	I should be able to open a wallet from seed.

Background:
	Given I am on the site

@watch
Scenario: Visitor opens wallet from seed
	When I click Open Wallet
	And wait for the page to open
    And enter my mnemonic phrase "body human immune manor herd offend inter saga softly bright soil look stroll below robot lobe beta update texas won clap hire end rarity frenzy floral stud virus eerily thin grab drew"
    And click Unlock Wallet
    Then I should see "Unlocking wallet..." on the page
    And I should then see my wallet address "Q879962c1af94b69864af2d9f40d5e5b224dbd159b86d1e1d2c0fb17d24cc9397f7037583" on the page