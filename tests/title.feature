Feature: Website showing correct Title
	As a visitor to the site,
	so that I know the site is loading correctly,
	The title of the page should be QRL Wallet

Background:
	Given I am on the site

@watch
Scenario: Visitor opens homepage
	Then I should see the Title as "QRL Wallet"