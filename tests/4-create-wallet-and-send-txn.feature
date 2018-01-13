Feature: Create Wallet and Send Txn
    As a visitor to the site,
    I should be able to create a new wallet
    And send a transaction from it

Background:
    Given I am on the site

@watch
Scenario: Visitor creates a wallet and sends a transaction
    When I click Create Wallet
    And type a passphrase "password123" in
    And press Create Basic Wallet
    Then I should see Generating New Wallet
    And I should then see my wallet details
    When I then click Transfer Quanta
    Then I should see my new address
    And I should see a precalculated OTS Key Index as "0"
    When I then fill in the to address as "Q25c2928dc208d562b73396c9142e00c93af5ee841dba5da528f85608ed7eb184a035a8f4"
    And enter the amount as "42"
    And enter the fee as "10"
    And change the OTS Key Index to "20"
    And click generate transaction
    Then I should see a loading icon
    And I should then see a form confirming my transaction
    When I then click confirmation transaction
    Then I should see "Your transaction is being relayed into the QRL network..."
    And I should see shortly after "Success! Your transaction has been relayed into the QRL network through the following nodes, and is pending validation."
    And I should "Transaction Status: Pending"
    And shortly after I should see "Transaction Status: Complete - Transaction"
