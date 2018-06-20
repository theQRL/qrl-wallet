Feature: Create Wallet
	As a visitor to the site,
	I should be able to create a new wallet.

Background:
	Given I am on the wallet site

@watch
Scenario: Visitor creates a wallet
	When I click New Wallet
	And type a passphrase "password123" in
    And press Create Wallet
    Then I should see Generating new wallet
    And I should then see my wallet details