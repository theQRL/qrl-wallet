Feature: QRL Wallet is Loading
	The QRL wallet website should load and have the correct title

Background:
	Given I am on the wallet site

@watch
Scenario: Visitor opens homepage
	Then I should see the title as "QRL Wallet"