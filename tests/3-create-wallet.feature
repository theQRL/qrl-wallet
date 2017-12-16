Feature: Create Wallet
	As a visitor to the site,
	I should be able to create a new wallet.

Background:
	Given I am on the site

@watch
Scenario: Visitor creates a wallet
	When I click Create Wallet
    And press Begin
    Then I should see Generating New Wallet
    And I should then see my wallet details