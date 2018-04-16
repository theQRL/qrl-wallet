Feature: Create Wallet and Send Txn
    As a visitor to the site,
    I should be able to create a new wallet
    And send a transaction from it

Background:
    Given I am on the site

@watch
Scenario: Visitor creates a wallet and sends a transaction
    When I click New Wallet
    And type a passphrase "password123" in
    And press Create Wallet
    Then I should see Generating new wallet
    And I should then see my wallet details for test 4
    Then I click Open Wallet
    Then I enter my new mnemonic phrase
    And click Unlock Wallet
    Then I should see "Unlocking wallet..." on the page
    And I should then see my new address on the page
    And I should see a precalculated OTS Key Index as "0"
    When I then fill in the to address as "Q010500cc037dec6d74a9479ec66391d3f0bb46fef62e2d8b2bca3a25d2aaf1310f63315bfb4c1d"
    And enter the amount as "42"
    And enter the fee as "10"
    And change the OTS Key Index to "20"
    And click confirm
    Then I should see a loading icon
    And I should then see a form confirming my transaction
    When I then click confirmation transaction
    Then I should see "Your transaction is being relayed into the QRL network..."
    And I should see shortly after "Success! Your transaction has been relayed into the QRL network through the following nodes, and is pending validation."
    And I should "Transaction Status: Pending"
    And shortly after I should see "Transaction Status: Complete - Transaction"
