Feature: Open SHA2_256 Wallet and Send Txn
    As a visitor to the site,
    I should be able to open an existing SHA2_256 wallet
    And send a transaction from it

Background:
    Given I am on the wallet site

@watch
Scenario: Visitor opens a wallet and sends a transaction
    When I click Open Wallet
    And enter my mnemonic phrase "aback drank itself lousy kitten tenant task cheek fort tom series heyday fig sorrow swan tehran legend gemini calmly beech arrive prior with airy orphan for royal afloat loaf host gorge stair avenue midst"
    And click Unlock Wallet
    Then I should see "Unlocking wallet..." on the page
    And I should then see my wallet address "Q000400243b6f4a60669afbb192a04157822da2dfb1d0f1b99856df6f6948b1704a5fc552c4e3f8" on the page
    When I then fill in the to address as "Q010200a3f33bbfff9432bee62828345ba4cb6e24182a43ea38f472ad3cf775941b25c0870d6f41"
    And enter the amount as "1"
    And enter the fee as "0.005"
    And change the OTS Key Index to "5"
    And click confirm
    And I should then see a form confirming my transaction
    When I then click confirmation transaction
    Then I should see "Your transaction is being relayed into the QRL network..."
    And I should see shortly after "Success! Your transaction has been relayed into the QRL network through the following nodes, and is pending validation."
    And I should "Transaction Status: Pending"
    And shortly after I should see "Transaction Status: Complete - Transaction"
