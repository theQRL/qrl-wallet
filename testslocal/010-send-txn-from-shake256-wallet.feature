Feature: Open Shake 256 Wallet and Send Txn
    As a visitor to the site,
    I should be able to open an existing shake 256 wallet
    And send a transaction from it

Background:
    Given I am on the wallet site

@watch
Scenario: Visitor opens a wallet and sends a transaction
    When I click Open Wallet
    And enter my mnemonic phrase "action drank axle clay bulk align spoon cheery squash moor mine linger dispel rest timid aura aunt lead robert niche almond boil devote kindly slam sigh burden amazon equity embark limit noble sport knight"
    And click Unlock Wallet
    Then I should see "Unlocking wallet..." on the page
    And I should then see my wallet address "Q02040084c25e7c81ea109853ef474c925a3f6a10ae7ceb5651e26282e5877bd4ce49039fc59bb9" on the page
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
